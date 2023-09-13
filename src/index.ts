/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */

// TODO compiling gives typescript unknown variable errors
// TODO filterObjs can break - if a referenced variable changes nothing updates the cache!

declare const globalconfig: GlobalConfig;

interface GlobalConfig {
  DiagonalMeasurementMethod: 'use_page_method' | ObjectPropertyMap['page']['diagonaltype'];
  ErrorMessageMode: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'FATAL';
}

type CharacterId = Roll20Id;
type GraphicId = Roll20Id;
type PageId = Roll20Id;

interface SimpleRollData extends ChatEventData {
  rolltemplate: 'simple';
}

interface ToggleAuraForTargetMessageInfo {
  command: 'toggle';
  graphicId1: GraphicId;
  graphicId2: GraphicId;
}

type NewVisibility = 'nobody' | 'me' | 'everyone';

interface SetAuraVisibilityMessageInfo {
  command: 'setAuraVisibility';
  paladinGraphicId: GraphicId;
  othersSeeAura: NewVisibility;
}

type ApiMessageInfo = ToggleAuraForTargetMessageInfo | SetAuraVisibilityMessageInfo;

interface GraphicInfo {
  graphic: Graphic;
  isNPC: boolean;
  auraBonus: number | boolean;
  getStringNameAndId(): string;
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
}

interface IInternalFunctions {
  isTokenOnActivePage(graphic: Graphic): boolean;
  infoFromApiMessageOrNull(message: ApiChatEventData): ApiMessageInfo | null;
  createGraphicInfoFromGraphic(graphic: Graphic): GraphicInfo;
  createCharacterInfoFromGraphicAndCharacter(graphic: Graphic, character: Character): CharacterInfo;
  getPaladinClassAndLevelAttrsOrNull(characterId: Roll20Id): { classAttr: Attribute; levelAttr: Attribute } | null;
  getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(
    graphicId: GraphicId
  ): GraphicInfo | CharacterInfo | PaladinInfo | null;
  auraExceptionsFromAttr(auraExceptionsAttr: Attribute): [GraphicId, boolean][];
  auraExceptionsToString(auraExceptionsList: [GraphicId, boolean][]): string;
  isNpcFromGraphicId(graphicId: GraphicId): boolean;
  toggleSelectedPaladinsAuraForTarget(paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void;
  cacheGraphicsAndApplyAurasOnActivePages(): void;
  findAndCacheGraphicsWithPageId(pageId: PageId): GraphicInfo[];
  findPaladinsFromGraphicArray(graphicInfos: GraphicInfo[]): PaladinInfo[];
  getPaladinAuraRadiusInSquaresOrNull(paladinInfo: PaladinInfo): number | null;
  applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo: PaladinInfo, graphicInfos: GraphicInfo[]): void;
  findAndCachePaladinsWithPageIdAndApplyAuras(pageId: PageId): void;
  cacheGraphicsAndApplyPaladinAurasForPages(uniqueActivePageIds: PageId[]): void;
  getUniqueActivePageIds(): PageId[];
  createPaladinMacrosForPaladinsInArray(infoArray: GraphicInfo[]): void;
  graphicChangeCallback(graphic: Graphic): void;
  graphicCreatedCallback(graphic: Graphic): void;
  attributeChangeCallback(attribute: Attribute, oldAttribute: ObjectPropertyMap['attribute']): void;
  chatObserver(message: ChatEventData): void;
  registerEventHandlers(): void;
  initDependantVariables(): void;
}

interface IPaladinAura {
  debug?: IInternalFunctions;
  startup(): void;
}

export const PaladinAura = ((): IPaladinAura => {
  // constants
  const APIName = 'PaladinAura';
  const apiCommandPrefix = '!pa';
  const auraExceptionsAttrName = 'paladin_aura_exceptions';
  const charismaBonusAttrName = 'charisma_mod';
  const hitpointsAttrName = 'hp';

  // global config variables
  const diagonalDistanceMethodOverride = globalconfig.DiagonalMeasurementMethod || 'use_page_method';
  const mode: Importance = globalconfig.ErrorMessageMode || 'DEBUG';

  const auraBonusIconName = 'status_bolt-shield';
  // ---

  const cache = new Map<GraphicId, GraphicInfo>();

  let campaign: Campaign;

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
    graphic.get('_subtype') === 'token' &&
    graphic.get('layer') === 'objects' &&
    getUniqueActivePageIds().includes(graphic.get('_pageid'));

  const getStringNameAndIdMethodForGraphic =
    (graphic: Graphic): (() => string) =>
    () =>
      `${graphic.get('name')} (${graphic.id})`;

  const createGraphicInfoFromGraphic = (graphic: Graphic): GraphicInfo => ({
    graphic,
    isNPC: true,
    auraBonus: graphic.get(auraBonusIconName),
    getStringNameAndId: getStringNameAndIdMethodForGraphic(graphic),
  });

  const createCharacterInfoFromGraphicAndCharacter = (graphic: Graphic, character: Character): CharacterInfo => ({
    ...createGraphicInfoFromGraphic(graphic),
    character,
    isNPC: isNpcFromGraphicId(graphic.id),
  });

  const createPaladinInfoFromGraphicCharacterAndAttributes = (
    graphic: Graphic,
    character: Character,
    attributes: PaladinInfo['attribute']
  ): PaladinInfo => ({
    ...createGraphicInfoFromGraphic(graphic),
    ...createCharacterInfoFromGraphicAndCharacter(graphic, character),
    attribute: attributes,
    isNPC: false,
  });

  // TODO clean
  const getPaladinClassAndLevelAttrsOrNull = (
    characterId: Roll20Id
  ): { classAttr: Attribute; levelAttr: Attribute } | null => {
    const paladinClassName = 'Paladin';

    const primaryClassAttr = Locs.getAttrObjByName(characterId, 'class');
    if (primaryClassAttr?.get('current') === paladinClassName) {
      const levelAttr = Locs.getAttrObjByName(characterId, 'base_level');
      if (!levelAttr) return null;

      return { classAttr: primaryClassAttr, levelAttr };
    }

    const multiclassAttrNames = ['multiclass1', 'multiclass2', 'multiclass3'];
    const multiclassPaladinAttrOrUndefined = multiclassAttrNames
      .map((attrName) => {
        const multiclassFlagIsActive = Locs.getAttrByName(characterId, attrName + '_flag') === '1';
        if (multiclassFlagIsActive) return Locs.getAttrObjByName(characterId, attrName);
      })
      .find((paladinClassAttrOrFalsy) => paladinClassAttrOrFalsy?.get('current') === paladinClassName);

    if (!multiclassPaladinAttrOrUndefined) return null;

    const levelAttrName = multiclassPaladinAttrOrUndefined.get('name') + '_lvl';
    const levelAttr = Locs.getAttrObjByName(characterId, levelAttrName);
    if (!levelAttr) return null;

    return { classAttr: multiclassPaladinAttrOrUndefined, levelAttr };
  };

  const getCharacterFromGraphicOrNull = (graphic: Graphic): Character | null => {
    const characterId = graphic.get('represents');
    if (!characterId) return null;

    const character = Locs.getObj('character', characterId);
    if (!character) return null;

    return character;
  };

  const createAndCacheGraphicInfo = (graphic: Graphic): GraphicInfo => {
    const graphicInfo = createGraphicInfoFromGraphic(graphic);
    cache.set(graphic.id, graphicInfo);
    return graphicInfo;
  };

  const createAndCacheCharacterInfo = (graphic: Graphic, character: Character): CharacterInfo => {
    const characterInfo = createCharacterInfoFromGraphicAndCharacter(graphic, character);
    cache.set(graphic.id, characterInfo);
    return characterInfo;
  };

  // TODO break out into other functions
  const getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull = (
    graphicId: GraphicId
  ): GraphicInfo | CharacterInfo | PaladinInfo | null => {
    const detailsFromCache = cache.get(graphicId);
    if (detailsFromCache) return detailsFromCache;

    const graphic = Locs.getObj('graphic', graphicId);
    if (!graphic) {
      conditionalLog('WARN', 'a paladin tried to toggle their aura for a token that does not exist');
      return null;
    }

    const character = getCharacterFromGraphicOrNull(graphic);
    if (!character) return createAndCacheGraphicInfo(graphic);

    const characterId = character.id;
    const npcAttrValue = Locs.getAttrByName(characterId, 'npc');
    if (npcAttrValue === '1') return createAndCacheCharacterInfo(graphic, character);

    const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
    if (!paladinClassAndLevel) return createAndCacheCharacterInfo(graphic, character);

    const { levelAttr } = paladinClassAndLevel;
    const charismaBonusAttr = Locs.getAttrObjByName(characterId, charismaBonusAttrName);
    const hpAttr = Locs.getAttrObjByName(characterId, hitpointsAttrName);
    if (!charismaBonusAttr || !hpAttr) {
      conditionalLog(
        'WARN',
        `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`
      );
      return createAndCacheCharacterInfo(graphic, character);
    }

    const auraExceptionsAttr = Locs.getOrCreateAttrObjByName(characterId, auraExceptionsAttrName);
    if (!auraExceptionsAttr) {
      conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
      return createAndCacheCharacterInfo(graphic, character);
    }

    const paladinInfo: PaladinInfo = createPaladinInfoFromGraphicCharacterAndAttributes(graphic, character, {
      level: levelAttr,
      charismaBonus: charismaBonusAttr,
      hp: hpAttr,
      auraExceptions: auraExceptionsAttr,
    });
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

  const isNpcFromGraphicId = (graphicId: GraphicId): boolean => {
    const graphic = Locs.getObj('graphic', graphicId);
    if (!graphic) return true;

    const characterId = graphic.get('represents');
    if (!characterId) return true;

    return Locs.getAttrByName(characterId, 'npc') === '1';
  };

  const toggleSelectedPaladinsAuraForTarget = (paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void => {
    conditionalLog('DEBUG', `attempting to toggle graphic "${paladinGraphicId}" aura for target "${targetGraphicId}"`);

    const paladinDetails = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(paladinGraphicId);
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
      const targetIsNPC = isNpcFromGraphicId(targetGraphicId);
      auraExceptionList.push([targetGraphicId, targetIsNPC]);
    }

    const newAuraExceptionsString = auraExceptionsToString(auraExceptionList);
    paladinDetails.attribute.auraExceptions.set('current', newAuraExceptionsString);
  };

  const cacheGraphicsAndApplyAurasOnActivePages = (): void => {
    const uniqueActivePageIds = getUniqueActivePageIds();
    cacheGraphicsAndApplyPaladinAurasForPages(uniqueActivePageIds);
  };

  const findAndCacheGraphicsWithPageId = (pageId: PageId): GraphicInfo[] => {
    const page = Locs.getObj('page', pageId);
    if (!page) {
      conditionalLog('WARN', 'a player is listed as viewing a page that does not exist');
      return [];
    }

    const graphicsOnPage = Locs.findObjs<'graphic'>({
      _type: 'graphic',
      _subtype: 'token',
      layer: 'objects',
      _pageid: pageId,
    });

    return graphicsOnPage
      .map((graphic) => getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id))
      .filter((graphicInfo): graphicInfo is GraphicInfo => !!graphicInfo);
  };

  const findPaladinsFromInfoArray = (graphicInfos: GraphicInfo[]): PaladinInfo[] => graphicInfos.filter(isPaladinInfo);

  const getPaladinAuraRadiusInSquaresOrNull = (paladinInfo: PaladinInfo): number | null => {
    if (+paladinInfo.attribute.hp.get('current') <= 0) return null;

    const level = +paladinInfo.attribute.level.get('current');
    if (level < 6) {
      conditionalLog('WARN', `paladin '${paladinInfo.getStringNameAndId()}' had calculated aura radius of null`);
      return null;
    }
    if (level < 18) return 2;
    return 6;
  };

  const appendPageCalculationToLedWithGraphics = (ledMethodSelector: MethodSelector): UnitSelector | undefined => {
    switch (diagonalDistanceMethodOverride) {
      case 'use_page_method':
        return ledMethodSelector?.byPageDistance();
      case 'foure':
        return ledMethodSelector?.byFoure();
      case 'manhattan':
        return ledMethodSelector?.byManhattan();
      case 'pythagorean':
        return ledMethodSelector?.byPythagorean();
      case 'threefive':
        return ledMethodSelector?.byThreeFive();
    }
  };

  const getDistanceBetweenGraphicsInSquares = (graphicA: Graphic, graphicB: Graphic): number => {
    const ledMethodSelector = Led.from(graphicA)?.to(graphicB);
    if (!ledMethodSelector) return Infinity;
    const ledUnitSelector = appendPageCalculationToLedWithGraphics(ledMethodSelector);
    return ledUnitSelector?.inSquares() ?? Infinity;
  };

  // TODO break out to functions
  const applyPaladinAuraToGraphicInfoAuraBonuses = (paladinInfo: PaladinInfo, graphicInfos: GraphicInfo[]): void => {
    conditionalLog(
      'DEBUG',
      `applying aura for paladin '${paladinInfo.getStringNameAndId()}' to graphics [${graphicInfos.map((g) =>
        g.getStringNameAndId()
      )}]`
    );
    const auraRadiusInSquares = getPaladinAuraRadiusInSquaresOrNull(paladinInfo);
    if (!auraRadiusInSquares) return;

    const paladinAuraBonus = +paladinInfo.attribute.charismaBonus.get('current');

    const graphicsInRangeOfAura = graphicInfos.filter((graphicOnPageInfo) => {
      const auraExceptions = auraExceptionsFromAttr(paladinInfo.attribute.auraExceptions);
      const exception = auraExceptions.find(([graphicId]) => graphicId === graphicOnPageInfo.graphic.id)?.[1];
      const willGrantBonus = exception === true || (exception !== false && !graphicOnPageInfo.isNPC);
      const distanceBetweenTokensInSquares = getDistanceBetweenGraphicsInSquares(
        paladinInfo.graphic,
        graphicOnPageInfo.graphic
      );
      const withinAuraDistance = distanceBetweenTokensInSquares <= auraRadiusInSquares;
      conditionalLog(
        'DEBUG',
        `AURA RESULT BETWEEN PALADIN '${paladinInfo.getStringNameAndId()}' AND TOKEN '${graphicOnPageInfo.getStringNameAndId()}':\nEXCEPTION LISTING: ${exception}\nWILL GRANT BONUS: ${willGrantBonus}\nFINAL DISTANCE BETWEEN TOKENS: ${distanceBetweenTokensInSquares}\nWITHIN AURA DISTANCE: ${withinAuraDistance}`
      );
      return willGrantBonus && withinAuraDistance;
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
    conditionalLog('DEBUG', "called 'findAndCachePaladinsWithPageIdAndApplyAuras'");

    const graphicInfosForPage = findAndCacheGraphicsWithPageId(pageId);
    graphicInfosForPage.forEach((graphicInfo) => {
      graphicInfo.auraBonus = false;
    });

    const paladinInfosForPage = findPaladinsFromInfoArray(graphicInfosForPage);
    paladinInfosForPage.forEach((paladinInfo) => {
      applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, graphicInfosForPage);
    });

    graphicInfosForPage.forEach((graphicInfo) => {
      conditionalLog(
        'DEBUG',
        `gave token '${graphicInfo.getStringNameAndId()}' paladin aura bonus of ${graphicInfo.auraBonus}`
      );
      graphicInfo.graphic.set(auraBonusIconName, graphicInfo.auraBonus);
    });
  };

  const cacheGraphicsAndApplyPaladinAurasForPages = (targetPages: PageId[]): void => {
    conditionalLog('DEBUG', "called 'cacheGraphicsAndApplyPaladinAurasForPages'");
    targetPages.forEach((pageId) => {
      findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    });
  };

  const getUniqueActivePageIds = (): PageId[] => {
    const uniqueActivePageIds = Array.from(
      new Set([campaign.get('playerpageid'), ...Object.values(campaign.get('playerspecificpages'))]).values()
    );
    conditionalLog('DEBUG', `unique active page ids: '${uniqueActivePageIds}'`);
    return uniqueActivePageIds;
  };

  const createPaladinMacrosForPaladinsInfos = (paladinInfos: PaladinInfo[]): void => {
    conditionalLog(
      'DEBUG',
      `creating paladin ability macros for paladin graphics: [${paladinInfos.map((info) => info.getStringNameAndId())}]`
    );
    const abilityMacroActionDefaults: Partial<ObjectCreationPropertiesMap['ability']>[] = [
      { name: 'Toggle aura for target', description: 'Toggle your paladin aura for the selected target.' },
      { name: 'Set your auras visibility', description: 'Toggle whether your paladin aura is visible.' },
    ];
    const abilityMacroActions = [
      '!pa toggle @{selected|token_id} @{target|token_id}',
      '!pa setAuraVisibility @{selected|token_id} ?{Who should see your aura?|nobody|me|everyone}',
    ];
    const abilityMacroActionsLength = abilityMacroActions.length;

    const paladinCharacters = Array.from(new Set(paladinInfos.map((info) => info.character)).values());
    const paladinAbilityMap = new Map<CharacterId, (Ability | null)[]>(
      paladinCharacters.map((character) => [character.id, new Array(abilityMacroActionsLength).fill(null)])
    );
    const allAbilities = Locs.findObjs<'ability'>({ _type: 'ability' });
    const paladinAbilityMacros = allAbilities.filter((ability) => abilityMacroActions.includes(ability.get('action')));
    paladinAbilityMacros.forEach((ability) => {
      const abilityCharacterId = ability.get('_characterid');
      const paladinAbilitiesArray = paladinAbilityMap.get(abilityCharacterId);
      if (!paladinAbilitiesArray) return;

      const abilityAction = ability.get('action');
      const abilityIndex = abilityMacroActions.indexOf(abilityAction);
      paladinAbilitiesArray[abilityIndex] = ability;
    });

    paladinAbilityMap.forEach((abilities, paladinId) => {
      if (!paladinId) return;

      abilities.forEach((ability, i) => {
        if (!ability) {
          createObj('ability', {
            _characterid: paladinId,
            action: abilityMacroActions[i],
            istokenaction: true,
            ...abilityMacroActionDefaults[i],
          });
        }
      });
    });
  };

  const setAuraVisibilityForPaladin = (graphicId: GraphicId, newAuraVisibility: NewVisibility): void => {
    conditionalLog(
      'DEBUG',
      `toggling aura visibility for graphicId: ${graphicId} - new aura visible: ${newAuraVisibility}`
    );

    const paladinInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphicId);
    if (!paladinInfo || !isPaladinInfo(paladinInfo)) {
      conditionalLog(
        'ERROR',
        'a graphic that does not represent a paladin tried to toggle their paladin aura visibility'
      );
      return;
    }

    const pageId = paladinInfo.graphic.get('_pageid');
    const page = Locs.getObj('page', pageId);
    if (!page) {
      conditionalLog('ERROR', 'could not set aura visibility - graphic page could not be found');
      return;
    }

    const paladinAuraRadiusInSquares = getPaladinAuraRadiusInSquaresOrNull(paladinInfo) ?? 0;
    const paladinAuraRadiusInPageUnits = Led.convert(paladinAuraRadiusInSquares)
      .fromSquares()
      .toPageUnits()
      .onPage(page);
    if (paladinAuraRadiusInPageUnits === undefined) {
      conditionalLog('ERROR', 'failed to convert paladin aura from squares to page units');
      return;
    }

    const useSquareAura =
      diagonalDistanceMethodOverride !== 'use_page_method'
        ? diagonalDistanceMethodOverride === 'foure'
        : page.get('diagonaltype') === 'foure';

    interface AuraDetailsInterface {
      aura2_radius: string;
      aura2_square: boolean;
      showplayers_aura2: boolean;
    }
    type AuraDetails = {
      [K in keyof AuraDetailsInterface & keyof GraphicMutableSynchronousGetProperties]-?: Exclude<
        AuraDetailsInterface[K],
        undefined
      >;
    };
    const currentAuraDetails: AuraDetails = {
      aura2_radius: paladinInfo.graphic.get('aura2_radius'),
      aura2_square: paladinInfo.graphic.get('aura2_square'),
      showplayers_aura2: paladinInfo.graphic.get('showplayers_aura2'),
    };
    const newAuraDetails: AuraDetails = {
      aura2_radius: newAuraVisibility === 'nobody' ? '' : paladinAuraRadiusInPageUnits.toString(),
      aura2_square: useSquareAura,
      showplayers_aura2: newAuraVisibility === 'everyone',
    };

    let changedNoValues = true;
    const keys = Object.keys(currentAuraDetails) as (keyof AuraDetails)[];
    keys.forEach((key) => {
      if (currentAuraDetails[key] !== newAuraDetails[key]) {
        changedNoValues = false;
        paladinInfo.graphic.set(key, newAuraDetails[key]);
      }
    });

    if (changedNoValues) paladinInfo.graphic.set('aura2_radius', '');
  };

  const graphicCreatedCallback = (graphic: Graphic): void => {
    if (isTokenOnActivePage(graphic)) return;

    const graphicInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) return;

    if (isPaladinInfo(graphicInfo)) createPaladinMacrosForPaladinsInfos([graphicInfo]);
    graphicChangeCallback(graphic);
  };

  const graphicChangeCallback = (graphic: Graphic): void => {
    conditionalLog('DEBUG', "called 'graphicChangeCallback'");

    const graphicInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) {
      conditionalLog('WARN', `failed to get or create info object for graphic '${graphic.id}'`);
      return;
    }

    conditionalLog('DEBUG', `token '${graphicInfo.getStringNameAndId()}' recalculating aura bonuses`);
    const pageId = graphic.get('_pageid');
    graphicInfo.auraBonus = false;
    if (isPaladinInfo(graphicInfo)) {
      findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    } else {
      const allGraphicInfosOnPage = findAndCacheGraphicsWithPageId(pageId);
      const paladinInfosOnPage = findPaladinsFromInfoArray(allGraphicInfosOnPage);
      paladinInfosOnPage.forEach((paladinInfo) => {
        applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, [graphicInfo]);
      });
      graphicInfo.graphic.set(auraBonusIconName, graphicInfo.auraBonus); // TODO combine with findAndCachePaladinsWithPageIdAndApplyAuras
    }
  };

  const graphicDestroyCallback = (graphic: Graphic): void => {
    cache.delete(graphic.id);
  };

  const attributeChangeCallback = (attribute: Attribute, oldAttribute: ObjectPropertyMap['attribute']): void => {
    const attrName = attribute.get('name');
    if (attrName !== charismaBonusAttrName) {
      const current = +attribute.get('current');
      const old = +oldAttribute.current;
      if (current === old || (current > 0 && old > 0)) return;
    }

    const uniqueActivePageIds = getUniqueActivePageIds();
    const pageIdsWithRepresentativeGraphics = Array.from(
      new Set(
        Locs.findObjs<'graphic'>({
          _type: 'graphic',
          represents: attribute.get('_characterid'),
        })
          .map((graphic) => graphic.get('_pageid'))
          .filter((pageId) => uniqueActivePageIds.includes(pageId))
      ).values()
    );

    cacheGraphicsAndApplyPaladinAurasForPages(pageIdsWithRepresentativeGraphics);
  };

  const pageChangeCallback = (page: Page): void => {
    if (getUniqueActivePageIds().includes(page.id)) findAndCachePaladinsWithPageIdAndApplyAuras(page.id);
  };

  const infoFromApiMessageOrNull = (message: ApiChatEventData): ApiMessageInfo | null => {
    conditionalLog('DEBUG', `message detected "${message.content}"`);

    const messageParts = message.content.split(/\s+/g);
    if (messageParts[0] !== apiCommandPrefix) return null;

    if (messageParts.length === 4 && (messageParts[1] as ToggleAuraForTargetMessageInfo['command']) === 'toggle') {
      return {
        command: 'toggle',
        graphicId1: messageParts[2],
        graphicId2: messageParts[3],
      };
    }

    if (
      messageParts.length === 4 &&
      (messageParts[1] as SetAuraVisibilityMessageInfo['command']) === 'setAuraVisibility'
    ) {
      return {
        command: 'setAuraVisibility',
        paladinGraphicId: messageParts[2],
        othersSeeAura: messageParts[3] as NewVisibility,
      };
    }

    return null;
  };

  const chatObserver = (message: ChatEventData): void => {
    if (isApiMessage(message)) {
      const messageInfo = infoFromApiMessageOrNull(message);
      if (!messageInfo) return;

      conditionalLog('DEBUG', `${messageInfo}`);

      if (messageInfo.command === 'toggle') {
        const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
        toggleSelectedPaladinsAuraForTarget(paladinGraphicId, targetGraphicId);
        cacheGraphicsAndApplyAurasOnActivePages();
      } else if (messageInfo.command === 'setAuraVisibility') {
        const { paladinGraphicId, othersSeeAura } = messageInfo;
        setAuraVisibilityForPaladin(paladinGraphicId, othersSeeAura);
      }
    } else if (isSimpleRoll(message)) {
      // TODO reference old version and implement here
      return;
    }
  };

  const registerEventHandlers = (): void => {
    on('chat:message', chatObserver);
    on('change:campaign:playerspecificpages', cacheGraphicsAndApplyAurasOnActivePages);
    on('change:campaign:playerpageid', cacheGraphicsAndApplyAurasOnActivePages);
    on('add:graphic', graphicCreatedCallback);
    on('change:graphic', graphicChangeCallback);
    on('destroy:graphic', graphicDestroyCallback);
    on('change:attribute', attributeChangeCallback);
    on('change:page', pageChangeCallback);
    conditionalLog('DEBUG', 'finished registering event handlers');
  };

  const initDependantVariables = (): void => {
    campaign = Campaign();
  };

  const startup = (): void => {
    initDependantVariables();

    cacheGraphicsAndApplyAurasOnActivePages();
    conditionalLog(
      'DEBUG',
      `finished caching on all active pages, final results:\n---\n${Array.from(cache.entries())
        .map(([graphicId, graphicInfo]) => `${graphicId}: ${graphicInfo.getStringNameAndId()}`)
        .join('\n')}\n---`
    );

    const paladinInfos = Array.from(cache.values()).filter((graphicInfo) =>
      isPaladinInfo(graphicInfo)
    ) as PaladinInfo[];
    createPaladinMacrosForPaladinsInfos(paladinInfos);
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
          getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull,
          auraExceptionsFromAttr,
          auraExceptionsToString,
          isNpcFromGraphicId,
          toggleSelectedPaladinsAuraForTarget,
          cacheGraphicsAndApplyAurasOnActivePages,
          findAndCacheGraphicsWithPageId,
          findPaladinsFromGraphicArray: findPaladinsFromInfoArray,
          getPaladinAuraRadiusInSquaresOrNull,
          applyPaladinAuraToGraphicInfoAuraBonuses,
          findAndCachePaladinsWithPageIdAndApplyAuras,
          cacheGraphicsAndApplyPaladinAurasForPages,
          getUniqueActivePageIds,
          createPaladinMacrosForPaladinsInArray: createPaladinMacrosForPaladinsInfos,
          graphicChangeCallback,
          graphicCreatedCallback,
          attributeChangeCallback,
          chatObserver,
          registerEventHandlers,
          initDependantVariables,
        },
        startup,
      }
    : {
        startup,
      };
})();

on('ready', PaladinAura.startup);
