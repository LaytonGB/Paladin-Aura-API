/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */

// TODO compiling gives typescript unknown variable errors

interface GlobalConfig {
  FindNpcBonuses: boolean;
  DiagonalMeasurementMethod: 'use_page_method' | ObjectPropertyMap['page']['diagonaltype'];
  ErrorMessageMode: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'FATAL';
}

declare const globalconfig: GlobalConfig;

interface ChatCommands {
  send(message: string): void;
  error(message: string): void;
}

type CharacterId = Roll20Id;
type GraphicId = Roll20Id;
type PageId = Roll20Id;

interface Dnd5eRollData extends ChatEventData {
  rolledByCharacterId: CharacterId;
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
  getStringNameAndGraphicId(): string;
}

interface CharacterInfo extends GraphicInfo {
  character: Character;
}

type CharacterWithAuraBonusInfo = CharacterInfo & { auraBonus: number };

interface PaladinInfo extends CharacterInfo {
  attribute: {
    level: Attribute;
    charismaMod: Attribute;
    hp: Attribute;
    auraExceptions: Attribute;
  };
}

interface IPaladinAura {
  startup(): void;
}

export const PaladinAura = ((): IPaladinAura => {
  // options
  const diagonalDistanceMethodOverride = globalconfig.DiagonalMeasurementMethod || 'use_page_method';
  const mode: Importance = globalconfig.ErrorMessageMode || 'DEBUG';
  const auraBonusIconName = 'status_bolt-shield';

  // constants
  const APIName = 'PaladinAura';
  const apiCommandPrefix = '!pa';
  const attrNames = {
    auraExceptions: 'paladin_aura_exceptions',
    charismaMod: 'charisma_mod',
    hitpoints: 'hp',
    isNpc: 'npc',
  };
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
      if (importanceValue >= importanceMap.ERROR) chat.error(`/w gm ${importance}: ${message}`);

      log(`${APIName} ${importance}: ${message}`);
    }
  };

  const chat = ((): ChatCommands => {
    const addTemplate = (message: string, background: string, color: string): string =>
      `<br><div style="text-align:center; background:${background}; color:${color}; border-radius:8px; padding:6px">${message}</div>`;
    return {
      send: (message: string): void => {
        sendChat(APIName, addTemplate(message, '#282C34', '#63B2EC'));
      },
      error: (message: string): void => {
        sendChat(APIName, addTemplate(message, '#282C34', '#DE6876'));
      },
    };
  })();

  const is = {
    characterInfo: (info: GraphicInfo): info is CharacterInfo => !!(info as CharacterInfo).character,
    paladinInfo: (info: GraphicInfo | CharacterInfo): info is PaladinInfo => !!(info as PaladinInfo).attribute,
    apiMessage: (message: ChatEventData): message is ApiChatEventData => message.type === 'api',
    characterRoll: (message: ChatEventData): message is Dnd5eRollData =>
      !!(message as Dnd5eRollData).rolledByCharacterId,
    tokenOnActivePage: (graphic: Graphic): boolean =>
      graphic.get('_subtype') === 'token' &&
      graphic.get('layer') === 'objects' &&
      getUniqueActivePageIds().includes(graphic.get('_pageid')),
  };

  const getStringNameAndIdMethodForGraphic =
    (graphic: Graphic): (() => string) =>
    () =>
      `${graphic.get('name')} (${graphic.id})`;

  const createGraphicInfoFromGraphic = (graphic: Graphic): GraphicInfo => ({
    graphic,
    isNPC: true,
    auraBonus: graphic.get(auraBonusIconName),
    getStringNameAndGraphicId: getStringNameAndIdMethodForGraphic(graphic),
  });

  const createCharacterInfoFromGraphicAndCharacter = (graphic: Graphic, character: Character): CharacterInfo => ({
    ...createGraphicInfoFromGraphic(graphic),
    character,
    isNPC: Locs.getAttrByName(character.id, attrNames.isNpc) === '1',
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

    const character = getObj('character', characterId);
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

  const getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull = (
    graphicId: GraphicId
  ): GraphicInfo | CharacterInfo | PaladinInfo | null => {
    const detailsFromCache = cache.get(graphicId);
    if (detailsFromCache) return detailsFromCache;

    const graphic = getObj('graphic', graphicId);
    if (!graphic || graphic.get('_subtype') !== 'token') {
      conditionalLog('WARN', 'tried to get a graphic that does not exist');
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
    const charismaModAttr = Locs.getAttrObjByName(characterId, attrNames.charismaMod);
    const hpAttr = Locs.getAttrObjByName(characterId, attrNames.hitpoints);
    if (!charismaModAttr || !hpAttr) {
      conditionalLog(
        'WARN',
        `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`
      );
      return createAndCacheCharacterInfo(graphic, character);
    }

    const auraExceptionsAttr = Locs.getOrCreateAttrObjByName(characterId, attrNames.auraExceptions);
    if (!auraExceptionsAttr) {
      conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
      return createAndCacheCharacterInfo(graphic, character);
    }

    const paladinInfo: PaladinInfo = createPaladinInfoFromGraphicCharacterAndAttributes(graphic, character, {
      level: levelAttr,
      charismaMod: charismaModAttr,
      hp: hpAttr,
      auraExceptions: auraExceptionsAttr,
    });
    cache.set(graphicId, paladinInfo);
    return paladinInfo;
  };

  const auraExceptionsFromAttr = (auraExceptionsAttr: Attribute): [GraphicId | CharacterId, boolean][] =>
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

  const toggleSelectedPaladinsAuraForTarget = (paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void => {
    conditionalLog('DEBUG', `attempting to toggle graphic "${paladinGraphicId}" aura for target "${targetGraphicId}"`);

    const paladinDetails = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(paladinGraphicId);
    if (!paladinDetails || !is.paladinInfo(paladinDetails)) {
      conditionalLog('ERROR', 'a non-paladin graphic was selected while trying to toggle paladin aura for a target');
      return;
    }

    const targetDetails = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(targetGraphicId);
    if (!targetDetails) {
      conditionalLog('ERROR', 'target of paladin aura toggle could not be found');
      return;
    }

    let newExceptionValue = true;
    const auraExceptionList = auraExceptionsFromAttr(paladinDetails.attribute.auraExceptions);
    const exceptionId =
      is.characterInfo(targetDetails) && !targetDetails.isNPC ? targetDetails.character.id : targetGraphicId;
    const existingExceptionIndex = auraExceptionList.findIndex(([id]) => id === exceptionId);
    if (existingExceptionIndex !== -1) {
      newExceptionValue = !auraExceptionList[existingExceptionIndex][1];
      auraExceptionList[existingExceptionIndex][1] = newExceptionValue;
    } else {
      auraExceptionList.push([exceptionId, true]);
    }

    const newAuraExceptionsString = auraExceptionsToString(auraExceptionList);
    paladinDetails.attribute.auraExceptions.set('current', newAuraExceptionsString);

    conditionalLog(
      'INFO',
      `${paladinDetails.getStringNameAndGraphicId()} ${
        newExceptionValue ? 'enabled' : 'disabled'
      } their aura for ${targetDetails.getStringNameAndGraphicId()}`
    );
  };

  const cacheGraphicsAndApplyAurasOnActivePages = (): void => {
    const uniqueActivePageIds = getUniqueActivePageIds();
    cacheGraphicsAndApplyPaladinAurasForPages(uniqueActivePageIds);
  };

  const findAndCacheGraphicsWithPageId = (pageId: PageId): GraphicInfo[] => {
    const page = getObj('page', pageId);
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

  const getPaladinAuraRadiusInSquaresOrNull = (paladinInfo: PaladinInfo): number | null => {
    if (+paladinInfo.attribute.hp.get('current') <= 0) return null;

    const level = +paladinInfo.attribute.level.get('current');
    if (level < 6) {
      conditionalLog('WARN', `paladin '${paladinInfo.getStringNameAndGraphicId()}' had calculated aura radius of null`);
      return null;
    }
    if (level < 18) return 2;
    return 6;
  };

  const getDistanceBetweenGraphicsInSquares = (graphicA: Graphic, graphicB: Graphic): number => {
    const appendPageCalculationToLedWithGraphics = (): UnitSelector | undefined => {
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

    const ledMethodSelector = Led.from(graphicA)?.to(graphicB);
    if (!ledMethodSelector) return Infinity;
    const ledUnitSelector = appendPageCalculationToLedWithGraphics();
    return ledUnitSelector?.inSquares() ?? Infinity;
  };

  const applyPaladinAuraToGraphicInfoAuraBonuses = (paladinInfo: PaladinInfo, graphicInfos: GraphicInfo[]): void => {
    conditionalLog(
      'DEBUG',
      `applying aura for paladin '${paladinInfo.getStringNameAndGraphicId()}' to graphics [${graphicInfos.map((g) =>
        g.getStringNameAndGraphicId()
      )}]`
    );

    const auraRadiusInSquares = getPaladinAuraRadiusInSquaresOrNull(paladinInfo);
    if (!auraRadiusInSquares) return;

    const paladinAuraBonus = +paladinInfo.attribute.charismaMod.get('current');

    const graphicsInRangeOfAura = graphicInfos.filter((graphicOnPageInfo) => {
      const auraExceptions = auraExceptionsFromAttr(paladinInfo.attribute.auraExceptions);
      const exceptionId =
        is.characterInfo(graphicOnPageInfo) && !graphicOnPageInfo.isNPC
          ? graphicOnPageInfo.character.id
          : graphicOnPageInfo.graphic.id;
      const exception = auraExceptions.find(([graphicOrCharacterId]) => graphicOrCharacterId === exceptionId)?.[1];
      const willGrantBonus = exception === true || (exception === undefined && !graphicOnPageInfo.isNPC);
      const distanceBetweenTokensInSquares = getDistanceBetweenGraphicsInSquares(
        paladinInfo.graphic,
        graphicOnPageInfo.graphic
      );
      const withinAuraDistance = distanceBetweenTokensInSquares <= auraRadiusInSquares;
      conditionalLog(
        'DEBUG',
        `AURA RESULT BETWEEN PALADIN '${paladinInfo.getStringNameAndGraphicId()}' AND TOKEN '${graphicOnPageInfo.getStringNameAndGraphicId()}':\nEXCEPTION LISTING: ${exception}\nWILL GRANT BONUS: ${willGrantBonus}\nFINAL DISTANCE BETWEEN TOKENS: ${distanceBetweenTokensInSquares}\nWITHIN AURA DISTANCE: ${withinAuraDistance}`
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

  const updateAurasForTargetInfosUsingPaladinInfos = (
    targetInfos: GraphicInfo[],
    paladinInfos: PaladinInfo[]
  ): void => {
    targetInfos.forEach((graphicInfo) => {
      graphicInfo.auraBonus = false;
    });

    paladinInfos.forEach((paladinInfo) => {
      applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, targetInfos);
    });

    targetInfos.forEach((graphicInfo) => {
      if (graphicInfo.auraBonus !== graphicInfo.graphic.get(auraBonusIconName)) {
        conditionalLog(
          'DEBUG',
          `gave token '${graphicInfo.getStringNameAndGraphicId()}' paladin aura bonus of ${graphicInfo.auraBonus}`
        );
        graphicInfo.graphic.set(auraBonusIconName, graphicInfo.auraBonus);
      }
    });
  };

  const findAndCachePaladinsWithPageIdAndApplyAuras = (pageId: PageId): void => {
    conditionalLog('DEBUG', "called 'findAndCachePaladinsWithPageIdAndApplyAuras'");

    const graphicInfosOnPage = findAndCacheGraphicsWithPageId(pageId);
    const paladinInfosOnPage = graphicInfosOnPage.filter(is.paladinInfo);
    updateAurasForTargetInfosUsingPaladinInfos(graphicInfosOnPage, paladinInfosOnPage);
  };

  const cacheGraphicsAndApplyPaladinAurasForPages = (targetPages: PageId[]): void => {
    conditionalLog('DEBUG', "called 'cacheGraphicsAndApplyPaladinAurasForPages'");
    targetPages.forEach((pageId) => {
      findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    });
  };

  const getUniqueActivePageIds = (): PageId[] => {
    const uniqueActivePageIds = Array.from(
      new Set([campaign.get('playerpageid'), ...Object.values(campaign.get('playerspecificpages'))])
    );
    conditionalLog('DEBUG', `unique active page ids: '${uniqueActivePageIds}'`);
    return uniqueActivePageIds;
  };

  const createPaladinMacrosForPaladinsInfos = (paladinInfos: PaladinInfo[]): void => {
    conditionalLog(
      'DEBUG',
      `creating paladin ability macros for paladin graphics: [${paladinInfos.map((info) =>
        info.getStringNameAndGraphicId()
      )}]`
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

    const paladinCharacters = Array.from(new Set(paladinInfos.map((info) => info.character)));
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
    if (!paladinInfo || !is.paladinInfo(paladinInfo)) {
      conditionalLog(
        'ERROR',
        'a graphic that does not represent a paladin tried to toggle their paladin aura visibility'
      );
      return;
    }

    const pageId = paladinInfo.graphic.get('_pageid');
    const page = getObj('page', pageId);
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
      [K in keyof AuraDetailsInterface & keyof GraphicMutableSynchronousGetProperties]: Exclude<
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

    const keys = Object.keys(currentAuraDetails) as (keyof AuraDetails)[];
    keys.forEach((key) => {
      if (currentAuraDetails[key] !== newAuraDetails[key]) paladinInfo.graphic.set(key, newAuraDetails[key]);
    });
  };

  const graphicCreatedCallback = (graphic: Graphic): void => {
    if (is.tokenOnActivePage(graphic)) return;

    const graphicInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) return;

    if (is.paladinInfo(graphicInfo)) createPaladinMacrosForPaladinsInfos([graphicInfo]);
    graphicChangeCallback(graphic);
  };

  const graphicChangeCallback = (graphic: Graphic): void => {
    const findPaladinsFromInfoArray = (graphicInfos: GraphicInfo[]): PaladinInfo[] =>
      graphicInfos.filter(is.paladinInfo);

    conditionalLog('DEBUG', "called 'graphicChangeCallback'");

    const graphicInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
    if (!graphicInfo) {
      conditionalLog('WARN', `failed to get or create info object for graphic '${graphic.id}'`);
      return;
    }

    const pageId = graphic.get('_pageid');
    if (is.paladinInfo(graphicInfo)) {
      findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    } else {
      const allGraphicInfosOnPage = findAndCacheGraphicsWithPageId(pageId);
      const paladinInfosOnPage = findPaladinsFromInfoArray(allGraphicInfosOnPage);
      updateAurasForTargetInfosUsingPaladinInfos([graphicInfo], paladinInfosOnPage);
    }
  };

  const graphicRepresentsChangeCallback = (graphic: Graphic): void => {
    cache.delete(graphic.id);
    getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
  };

  const graphicDestroyCallback = (graphic: Graphic): void => {
    cache.delete(graphic.id);
  };

  const attributeChangeCallback = (attribute: Attribute, oldAttribute: ObjectPropertyMap['attribute']): void => {
    const attrName = attribute.get('name');

    if (attrName === attrNames.hitpoints) {
      const current = +attribute.get('current');
      const old = +oldAttribute.current;
      if (current === old || (current > 0 && old > 0)) return;
    } else if (attrName !== attrNames.charismaMod && attrName !== attrNames.auraExceptions) {
      return;
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
      )
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
    } else if (
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

  const chatRollProcess = (message: Dnd5eRollData): void => {
    conditionalLog('DEBUG', 'roll in chat being processed');

    const characterId = message.rolledByCharacterId;
    if (!characterId) return;

    const character = getObj('character', characterId);
    if (!character) return;

    const characterGraphicsOnActivePages = getUniqueActivePageIds()
      .flatMap(findAndCacheGraphicsWithPageId) // fast because already cached
      .filter(
        (info) => is.characterInfo(info) && info.character === character && info.auraBonus
      ) as CharacterWithAuraBonusInfo[];
    if (characterGraphicsOnActivePages.length === 0) return;

    if (characterGraphicsOnActivePages.length === 1) {
      const bonus = characterGraphicsOnActivePages[0].auraBonus;
      chat.send(`${character.get('name')} has a Paladin Aura bonus of ${bonus}.`);
      return;
    }

    const playerId = message.playerid;
    const playerPageId = campaign.get('playerspecificpages')[playerId] || campaign.get('playerpageid');
    const graphicsOnPlayerPage = characterGraphicsOnActivePages.filter(
      (info) => info.graphic.get('_pageid') === playerPageId
    );
    const uniqueBonusesForGraphicsOnPlayerPage = Array.from(
      new Set(graphicsOnPlayerPage.map((info) => info.auraBonus))
    );
    if (uniqueBonusesForGraphicsOnPlayerPage.length === 1) {
      const bonus = graphicsOnPlayerPage[0].auraBonus;
      chat.send(`${character.get('name')} has a Paladin Aura bonus of ${bonus}.`);
      return;
    }

    uniqueBonusesForGraphicsOnPlayerPage.sort((a, b) => a - b);
    chat.send(
      `${character.get(
        'name'
      )} has multiple tokens with Paladin Aura bonuses: ${uniqueBonusesForGraphicsOnPlayerPage.join(', ')}.`
    );
  };

  const chatObserver = (message: ChatEventData): void => {
    if (is.apiMessage(message)) {
      const messageInfo = infoFromApiMessageOrNull(message);
      if (!messageInfo) return;

      conditionalLog('DEBUG', `API message info: ${messageInfo}`);

      if (messageInfo.command === 'toggle') {
        const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
        toggleSelectedPaladinsAuraForTarget(paladinGraphicId, targetGraphicId);
        cacheGraphicsAndApplyAurasOnActivePages();
      } else if (messageInfo.command === 'setAuraVisibility') {
        const { paladinGraphicId, othersSeeAura } = messageInfo;
        setAuraVisibilityForPaladin(paladinGraphicId, othersSeeAura);
      }
    } else if (is.characterRoll(message)) {
      chatRollProcess(message);
    }
  };

  const registerEventHandlers = (): void => {
    on('chat:message', chatObserver);
    on('change:campaign:playerspecificpages', cacheGraphicsAndApplyAurasOnActivePages);
    on('change:campaign:playerpageid', cacheGraphicsAndApplyAurasOnActivePages);
    on('add:graphic', graphicCreatedCallback);
    on('change:graphic', graphicChangeCallback);
    on('change:graphic:represents', graphicRepresentsChangeCallback);
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
        .map(([graphicId, graphicInfo]) => `${graphicId}: ${graphicInfo.getStringNameAndGraphicId()}`)
        .join('\n')}\n---`
    );

    const paladinInfos = Array.from(cache.values()).filter((graphicInfo) =>
      is.paladinInfo(graphicInfo)
    ) as PaladinInfo[];
    createPaladinMacrosForPaladinsInfos(paladinInfos);
    conditionalLog('DEBUG', 'finished creating ability macros for paladins');

    registerEventHandlers();
    conditionalLog('DEBUG', 'finished registering event handlers');

    log('-=> PaladinAura Ready <=-');
  };

  return {
    startup,
  };
})();

on('ready', PaladinAura.startup);
