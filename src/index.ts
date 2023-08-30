/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */

/**
TODO compiling gives typescript unknown variable errors
TODO filterObjs can break - if a referenced variable changes nothing updates the cache!
 */

type CharacterId = Roll20Id;
type GraphicId = Roll20Id;
type PageId = Roll20Id;

interface SimpleRollData extends ChatEventData {
  rolltemplate: 'simple';
}

interface ApiMessageInfo {
  command: 'toggle';
  graphicId1: Roll20Id;
  graphicId2: Roll20Id;
}

interface GraphicInfo {
  graphic: Graphic;
  isNPC: boolean;
  auraBonus: number | boolean;
}

interface CharacterInfo extends GraphicInfo {
  character: Character;
}

interface PaladinInfo extends CharacterInfo {
  attribute: {
    level: Attribute;
    charismaBonus: Attribute;
    hp: Attribute;
    auraExceptions: Attribute;
  };
  auraExceptionsList: [GraphicId, boolean][];
}

interface IInternalFunctions {
  isTokenOnActivePage(graphic: Graphic): boolean;
  infoFromApiMessageOrNull(message: ApiChatEventData): ApiMessageInfo | null;
  createGraphicInfoFromGraphic(graphic: Graphic): GraphicInfo;
  createCharacterInfoFromGraphicAndCharacter(graphic: Graphic, character: Character): CharacterInfo;
  getPaladinClassAndLevelAttrsOrNull(characterId: Roll20Id): { classAttr: Attribute; levelAttr: Attribute } | null;
  getOrCreateAndCacheInfoFromGraphicIdOrNull(graphicId: GraphicId): GraphicInfo | CharacterInfo | PaladinInfo | null;
  auraExceptionsFromAttr(auraExceptionsAttr: Attribute): [GraphicId, boolean][];
  auraExceptionsToString(auraExceptionsList: [GraphicId, boolean][]): string;
  graphicIsNPC(graphicId: GraphicId): boolean;
  toggleSelectedPaladinsAuraForTarget(paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void;
  cacheActivePagePaladinsAndUpdateLoadedPages(): void;
  findAndCacheGraphicsWithPageId(pageId: PageId): GraphicInfo[];
  findPaladinsFromGraphicArray(graphicInfos: GraphicInfo[]): PaladinInfo[];
  getPaladinAuraRadiusInSquaresOrNull(paladinInfo: PaladinInfo): number | null;
  applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo: PaladinInfo, graphicInfos: GraphicInfo[]): void;
  findAndCachePaladinsWithPageIdAndApplyAuras(pageId: PageId): void;
  cacheGraphicsForActivePagesAndApplyPaladinAuras(uniqueActivePageIds: PageId[]): void;
  unlistNoLongerLoadedPages(uniqueActivePageIds: PageId[]): void;
  getUniqueActivePageIds(): PageId[];
  createPaladinMacrosForPaladinsInArray(infoArray: GraphicInfo[]): void;
  graphicChangeCallback(graphic: Graphic): void;
  graphicCreatedCallback(graphic: Graphic): void;
  chatObserver(message: ChatEventData): void;
  registerEventHandlers(): void;
  initDependantVariables(): void;
  startup(): void;
}

interface IPaladinAura {
  debug?: IInternalFunctions;
  startup(): void;
}

export const PaladinAura = ((): IPaladinAura => {
  const APIName = 'PaladinAura';
  const auraBonusIconName = 'status_bolt-shield';
  const mode: Importance = 'DEBUG';

  const cache = new Map<GraphicId, GraphicInfo>();

  let locs: ILocs;
  let campaign: Campaign;

  let loadedPages: PageId[] = [];

  const importanceMap = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
  };
  type Importance = keyof typeof importanceMap;
  const logImportanceLimit = importanceMap[mode];
  const conditionalLog = (importance: Importance, message: string): void => {
    const importanceValue = importanceMap[importance];
    if (importanceValue >= logImportanceLimit) {
      if (importanceValue >= importanceMap.ERROR) sendChat(APIName, `/w gm ${importance}: ${message}`);

      log(`${APIName} ${importance}: ${message}`);
    }
  };

  const isPaladinInfo = (info: GraphicInfo | CharacterInfo): info is PaladinInfo => !!(info as PaladinInfo).attribute;

  const isApiMessage = (message: ChatEventData): message is ApiChatEventData => message.type === 'api';

  const isSimpleRoll = (message: ChatEventData): message is SimpleRollData => message.rolltemplate === 'simple';

  const isTokenOnActivePage = (graphic: Graphic): boolean =>
    graphic.get('_subtype') !== 'token' || graphic.get('layer') !== 'objects';

  const infoFromApiMessageOrNull = (message: ApiChatEventData): ApiMessageInfo | null => {
    conditionalLog('DEBUG', `message detected "${message.content}"`);

    const messageParts = message.content.split(/\s+/g);
    if (messageParts[0].toLowerCase() !== '!pa') return null;

    // more checks here if more commands ever get added
    if (messageParts.length !== 4 || messageParts[1].toLowerCase() !== 'toggle') return null;

    return {
      command: 'toggle',
      graphicId1: messageParts[2],
      graphicId2: messageParts[3],
    };
  };

  const createGraphicInfoFromGraphic = (graphic: Graphic): GraphicInfo => ({
    graphic,
    isNPC: true,
    auraBonus: graphic.get(auraBonusIconName),
  });

  const createCharacterInfoFromGraphicAndCharacter = (graphic: Graphic, character: Character): CharacterInfo => ({
    graphic,
    character,
    isNPC: locs.getAttrByName(character.id, 'npc') === '1',
    auraBonus: graphic.get(auraBonusIconName),
  });

  // TODO clean
  const getPaladinClassAndLevelAttrsOrNull = (
    characterId: Roll20Id
  ): { classAttr: Attribute; levelAttr: Attribute } | null => {
    const paladinClassName = 'Paladin';

    const primaryClassAttr = locs.getAttrObjByName(characterId, 'class');
    if (primaryClassAttr?.get('current') === paladinClassName) {
      const levelAttr = locs.getAttrObjByName(characterId, 'base_level');
      if (!levelAttr) return null;

      return { classAttr: primaryClassAttr, levelAttr };
    }

    const multiclassAttrNames = ['multiclass1', 'multiclass2', 'multiclass3'];
    const multiclassPaladinAttrOrUndefined = multiclassAttrNames
      .map((attrName) => {
        const multiclassFlagIsActive = locs.getAttrByName(characterId, attrName + '_flag') === '1';
        if (multiclassFlagIsActive) return locs.getAttrObjByName(characterId, attrName);
      })
      .find((paladinClassAttrOrFalsy) => paladinClassAttrOrFalsy?.get('current') === paladinClassName);

    if (!multiclassPaladinAttrOrUndefined) return null;

    const levelAttrName = multiclassPaladinAttrOrUndefined.get('name') + '_lvl';
    const levelAttr = locs.getAttrObjByName(characterId, levelAttrName);
    if (!levelAttr) return null;

    return { classAttr: multiclassPaladinAttrOrUndefined, levelAttr };
  };

  // TODO break out into other functions
  const getOrCreateAndCacheInfoFromGraphicIdOrNull = (
    graphicId: GraphicId
  ): GraphicInfo | CharacterInfo | PaladinInfo | null => {
    const detailsFromCache = cache.get(graphicId);
    if (detailsFromCache) return detailsFromCache;

    const graphic = locs.getObj('graphic', graphicId);
    if (!graphic) {
      conditionalLog('WARN', 'a paladin tried to toggle their aura for a token that does not exist');
      return null;
    }

    const getAndCacheGraphicInfo = (): GraphicInfo => {
      const graphicInfo = createGraphicInfoFromGraphic(graphic);
      cache.set(graphicId, graphicInfo);
      return graphicInfo;
    };

    const characterId = graphic.get('represents');
    if (!characterId) return getAndCacheGraphicInfo();

    const character = locs.getObj('character', characterId);
    if (!character) return getAndCacheGraphicInfo();

    const getAndCacheCharacterInfo = (): CharacterInfo => {
      const characterInfo = createCharacterInfoFromGraphicAndCharacter(graphic, character);
      cache.set(graphicId, characterInfo);
      return characterInfo;
    };

    const npcAttrValue = locs.getAttrByName(characterId, 'npc');
    if (npcAttrValue === '1') return getAndCacheCharacterInfo();

    const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
    if (!paladinClassAndLevel) return getAndCacheCharacterInfo();

    const { levelAttr } = paladinClassAndLevel;
    const charismaAttr = locs.getAttrObjByName(characterId, 'charisma_mod');
    const hpAttr = locs.getAttrObjByName(characterId, 'hp');
    if (!charismaAttr || !hpAttr) {
      conditionalLog(
        'WARN',
        `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`
      );
      return getAndCacheCharacterInfo();
    }

    const auraExceptionsAttrName = 'paladin_aura_exceptions';
    const auraExceptionsAttr =
      locs.getAttrObjByName(characterId, auraExceptionsAttrName) ||
      locs.createObj('attribute', {
        name: auraExceptionsAttrName,
        _characterid: characterId,
        current: '',
      });
    if (!auraExceptionsAttr) {
      conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
      return getAndCacheCharacterInfo();
    }

    const paladinInfo: PaladinInfo = {
      graphic,
      character: character,
      isNPC: false,
      auraBonus: graphic.get(auraBonusIconName),
      attribute: {
        level: levelAttr,
        charismaBonus: charismaAttr,
        hp: hpAttr,
        auraExceptions: auraExceptionsAttr,
      },
      auraExceptionsList: auraExceptionsFromAttr(auraExceptionsAttr),
    };
    cache.set(graphicId, paladinInfo);
    return paladinInfo;
  };

  const auraExceptionsFromAttr = (auraExceptionsAttr: Attribute): [GraphicId, boolean][] =>
    auraExceptionsAttr
      .get('current')
      .split(',')
      .filter((propAndValueString): propAndValueString is `${string}:${true | false}` => !!propAndValueString)
      .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
      });

  const auraExceptionsToString = (auraExceptionsList: [GraphicId, boolean][]): string =>
    auraExceptionsList.reduce((result, [id, applyAura]) => result + `,${id}:${applyAura}`, '').slice(1);

  const graphicIsNPC = (graphicId: GraphicId): boolean => {
    const graphic = locs.getObj('graphic', graphicId);
    if (!graphic) return true;

    const characterId = graphic.get('represents');
    if (!characterId) return true;

    return locs.getAttrByName(characterId, 'npc') === '1';
  };

  const toggleSelectedPaladinsAuraForTarget = (paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void => {
    conditionalLog('DEBUG', `attempting to toggle graphic "${paladinGraphicId}" aura for target "${targetGraphicId}"`);

    const paladinDetails = getOrCreateAndCacheInfoFromGraphicIdOrNull(paladinGraphicId);
    if (!paladinDetails || !isPaladinInfo(paladinDetails)) {
      conditionalLog(
        'WARN',
        'only paladins can toggle aura targets. Make sure the selected token represents a paladin'
      );
      return;
    }

    const auraExceptionList = auraExceptionsFromAttr(paladinDetails.attribute.auraExceptions);
    const existingExceptionIndex = auraExceptionList.findIndex(([id]) => id === targetGraphicId);
    if (existingExceptionIndex !== -1) {
      auraExceptionList[existingExceptionIndex][1] = !auraExceptionList[existingExceptionIndex][1];
    } else {
      const targetIsNPC = graphicIsNPC(targetGraphicId);
      auraExceptionList.push([targetGraphicId, targetIsNPC]);
    }

    const newAuraExceptionsString = auraExceptionsToString(auraExceptionList);
    paladinDetails.attribute.auraExceptions.set('current', newAuraExceptionsString);
  };

  const cacheActivePagePaladinsAndUpdateLoadedPages = (): void => {
    const uniqueActivePageIds = getUniqueActivePageIds();
    cacheGraphicsForActivePagesAndApplyPaladinAuras(uniqueActivePageIds);
    unlistNoLongerLoadedPages(uniqueActivePageIds);
  };

  const findAndCacheGraphicsWithPageId = (pageId: PageId): GraphicInfo[] => {
    const page = locs.getObj('page', pageId);
    if (!page) {
      conditionalLog('WARN', 'a player is listed as viewing a page that does not exist');
      return [];
    }

    const graphicsOnPage = locs.findObjs<'graphic'>({
      _type: 'graphic',
      _subtype: 'token',
      layer: 'objects',
      _pageid: pageId,
    });

    return graphicsOnPage
      .map((graphic) => getOrCreateAndCacheInfoFromGraphicIdOrNull(graphic.id))
      .filter((graphicInfo): graphicInfo is GraphicInfo => !!graphicInfo);
  };

  const findPaladinsFromGraphicArray = (graphicInfos: GraphicInfo[]): PaladinInfo[] =>
    graphicInfos.filter(isPaladinInfo);

  const getPaladinAuraRadiusInSquaresOrNull = (paladinInfo: PaladinInfo): number | null => {
    if (+paladinInfo.attribute.hp.get('current') <= 0) return null;

    const level = +paladinInfo.attribute.level.get('current');
    if (level < 6) return null;
    if (level < 18) return 2;
    return 6;
  };

  // TODO BUG some kind of bug here
  const applyPaladinAuraToGraphicInfoAuraBonuses = (paladinInfo: PaladinInfo, graphicInfos: GraphicInfo[]): void => {
    conditionalLog(
      'DEBUG',
      `applying aura for paladin '${paladinInfo.graphic.id}' to graphics [${graphicInfos.map((g) => g.graphic.id)}]`
    );
    const auraRadiusInSquares = getPaladinAuraRadiusInSquaresOrNull(paladinInfo);
    if (!auraRadiusInSquares) return;

    const paladinAuraBonus = +paladinInfo.attribute.charismaBonus.get('current');

    const graphicsInRangeOfAura = graphicInfos.filter((graphicOnPageInfo) => {
      const exception = paladinInfo.auraExceptionsList.find(
        ([graphicId]) => graphicId === graphicOnPageInfo.graphic.id
      )?.[1];
      const willGrantBonus = exception === true || (exception !== false && !graphicOnPageInfo.isNPC);
      const distanceBetweenTokensInSquares =
        Led.from(paladinInfo.graphic)?.to(graphicOnPageInfo.graphic)?.byPageDistance()?.inSquares() ?? Infinity;
      conditionalLog(
        'DEBUG',
        `AURA EXCEPTION RESULT: ${willGrantBonus}\nDISTANCE BETWEEN TOKENS: ${distanceBetweenTokensInSquares}`
      );
      return willGrantBonus && distanceBetweenTokensInSquares <= auraRadiusInSquares;
    });

    graphicsInRangeOfAura.forEach((graphicRecievingBonusInfo) => {
      const oldBonusOrBool = graphicRecievingBonusInfo.auraBonus;
      if (typeof oldBonusOrBool !== 'number' || oldBonusOrBool < paladinAuraBonus)
        graphicRecievingBonusInfo.auraBonus = paladinAuraBonus;
    });

    conditionalLog(
      'DEBUG',
      `apply aura results:\n- aura radius: ${auraRadiusInSquares}\n- aura bonus: ${paladinAuraBonus}\n- candidates: ${graphicsInRangeOfAura.map(
        (g) => g.graphic.id
      )}`
    );
  };

  const findAndCachePaladinsWithPageIdAndApplyAuras = (pageId: PageId): void => {
    const graphicInfosForPage = findAndCacheGraphicsWithPageId(pageId);
    graphicInfosForPage.forEach((graphicInfo) => {
      graphicInfo.auraBonus = false;
    });

    const paladinInfosForPage = findPaladinsFromGraphicArray(graphicInfosForPage);
    paladinInfosForPage.forEach((paladinInfo) => {
      applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, graphicInfosForPage);
    });

    graphicInfosForPage.forEach((graphicInfo) => {
      conditionalLog(
        'DEBUG',
        `gave token '${graphicInfo.graphic.id}' named '${graphicInfo.graphic.get('name')}' paladin aura bonus of ${
          graphicInfo.auraBonus
        }`
      );
      graphicInfo.graphic.set(auraBonusIconName, graphicInfo.auraBonus);
    });
  };

  const cacheGraphicsForActivePagesAndApplyPaladinAuras = (uniqueActivePageIds: PageId[]): void => {
    uniqueActivePageIds.forEach((pageId) => {
      if (!loadedPages.includes(pageId)) {
        findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
        loadedPages.push(pageId);
      }
    });
  };

  const unlistNoLongerLoadedPages = (uniqueActivePageIds: PageId[]): void => {
    loadedPages = loadedPages.filter((pageId) => uniqueActivePageIds.includes(pageId));
  };

  const getUniqueActivePageIds = (): PageId[] =>
    Array.from(new Set(Object.entries(campaign.get('playerspecificpages')).map(([, pageId]) => pageId)).values());

  const createPaladinMacrosForPaladinsInArray = (infoArray: GraphicInfo[]): void => {
    conditionalLog('DEBUG', 'creating paladin ability macros');
    const abilityMacroAction = '!pa toggle @{selected|token_id} @{target|token_id}';

    const characterAbilityMacrosMap = locs
      .findObjs<'ability'>({ _type: 'ability', action: abilityMacroAction })
      .reduce((abilityMap, ability) => {
        abilityMap.set(ability.get('_characterid'), ability);
        return abilityMap;
      }, new Map<CharacterId, Ability>());

    infoArray.forEach((info) => {
      if (!isPaladinInfo(info)) return;

      const existingAbilityMacro = characterAbilityMacrosMap.get(info.character.id);
      if (existingAbilityMacro) return;

      const createdAbilityMacro = locs.createObj('ability', {
        _characterid: info.character.id,
        name: 'Toggle aura for target',
        description: 'Toggle your paladin aura for the selected target.',
        action: abilityMacroAction,
        istokenaction: true,
      });

      if (!createdAbilityMacro)
        conditionalLog('WARN', `failed to create ability macro for paladin ${info.character.id}`);
      else conditionalLog('INFO', `created ability macro for paladin ${info.character.id}`);
    });
  };

  const graphicChangeCallback = (graphic: Graphic): void => {
    if (isTokenOnActivePage(graphic)) return;

    conditionalLog('DEBUG', `token '${graphic.id}' recalculating aura bonuses`);
    const pageId = graphic.get('_pageid');
    const graphicInfo = getOrCreateAndCacheInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) {
      conditionalLog('WARN', `failed to get or create info object for graphic '${graphic.id}'`);
      return;
    }

    graphicInfo.auraBonus = false;
    if (isPaladinInfo(graphicInfo)) {
      findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    } else {
      const allGraphicInfosOnPage = findAndCacheGraphicsWithPageId(pageId);
      const paladinInfosOnPage = findPaladinsFromGraphicArray(allGraphicInfosOnPage);
      paladinInfosOnPage.forEach((paladinInfo) => {
        applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, [graphicInfo]);
      });
    }
  };

  const graphicCreatedCallback = (graphic: Graphic): void => {
    if (isTokenOnActivePage(graphic)) return;

    const graphicInfo = getOrCreateAndCacheInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) return;

    createPaladinMacrosForPaladinsInArray([graphicInfo]);
    graphicChangeCallback(graphic);
  };

  const chatObserver = (message: ChatEventData): void => {
    if (isApiMessage(message)) {
      const messageInfo = infoFromApiMessageOrNull(message);
      if (!messageInfo) return;

      const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
      toggleSelectedPaladinsAuraForTarget(paladinGraphicId, targetGraphicId);
    } else if (isSimpleRoll(message)) {
      return;
    }
  };

  const registerEventHandlers = (): void => {
    // TODO assess this list of listeners
    on('chat:message', chatObserver);
    on('change:campaign:playerspecificpages', cacheActivePagePaladinsAndUpdateLoadedPages);
    on('change:graphic', graphicChangeCallback);
    on('add:graphic', graphicCreatedCallback);
    // on('destroy:graphic', Token.removeToken);
    // on('change:attribute', Token.updateAttrs);
    conditionalLog('DEBUG', 'finished registering event handlers');
  };

  const initDependantVariables = (): void => {
    locs = Locs.new();
    campaign = Campaign();
  };

  const startup = (): void => {
    initDependantVariables();

    const uniqueActivePageIds = getUniqueActivePageIds();
    cacheGraphicsForActivePagesAndApplyPaladinAuras(uniqueActivePageIds);
    conditionalLog(
      'DEBUG',
      `finished caching on all active pages, final results:\n---\n${Array.from(cache.entries()).join('\n')}\n---\n`
    );

    createPaladinMacrosForPaladinsInArray(Array.from(cache.values()));
    conditionalLog('DEBUG', 'finished creating ability macros for paladins');

    registerEventHandlers();
    conditionalLog('DEBUG', 'finished registering event handlers');

    log('-=> PaladinAura Ready <=-');
  };

  return mode === 'DEBUG'
    ? {
        debug: {
          isTokenOnActivePage,
          infoFromApiMessageOrNull,
          createGraphicInfoFromGraphic,
          createCharacterInfoFromGraphicAndCharacter,
          getPaladinClassAndLevelAttrsOrNull,
          getOrCreateAndCacheInfoFromGraphicIdOrNull,
          auraExceptionsFromAttr,
          auraExceptionsToString,
          graphicIsNPC,
          toggleSelectedPaladinsAuraForTarget,
          cacheActivePagePaladinsAndUpdateLoadedPages,
          findAndCacheGraphicsWithPageId,
          findPaladinsFromGraphicArray,
          getPaladinAuraRadiusInSquaresOrNull,
          applyPaladinAuraToGraphicInfoAuraBonuses,
          findAndCachePaladinsWithPageIdAndApplyAuras,
          cacheGraphicsForActivePagesAndApplyPaladinAuras,
          unlistNoLongerLoadedPages,
          getUniqueActivePageIds,
          createPaladinMacrosForPaladinsInArray,
          graphicChangeCallback,
          graphicCreatedCallback,
          chatObserver,
          registerEventHandlers,
          initDependantVariables,
          startup,
        },
        startup,
      }
    : {
        startup,
      };
})();

on('ready', PaladinAura.startup);
