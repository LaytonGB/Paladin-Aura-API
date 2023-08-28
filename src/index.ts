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
}

interface CharacterInfo extends GraphicInfo {
  character: Character;
  isNPC: boolean;
}

interface PaladinInfo extends CharacterInfo {
  attribute: {
    level: Attribute;
    charisma: Attribute;
    hp: Attribute;
    auraExceptions: Attribute;
  };
}

interface IPaladinAura {
  startup: () => void;
}

export const PaladinAura = ((): IPaladinAura => {
  const APIName = 'PaladinAura';
  const locs = Locs.new();
  const cache = new Map<GraphicId, GraphicInfo>();

  const importanceMap = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
  };
  type Importance = keyof typeof importanceMap;
  const mode: Importance = 'DEBUG';
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

  const getGraphicInfoFromGraphic = (graphic: Graphic): GraphicInfo => ({ graphic });

  const getCharacterInfoFromGraphicAndCharacter = (graphic: Graphic, character: Character): CharacterInfo => ({
    graphic,
    character,
    isNPC: locs.getAttrByName(character.id, 'npc') === '1',
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

  const getPaladinInfoFromGraphicOrNull = (graphicId: Roll20Id): PaladinInfo | null => {
    const detailsFromCache = cache.get(graphicId);
    if (detailsFromCache) {
      if (isPaladinInfo(detailsFromCache)) return detailsFromCache;
      else return null;
    }

    const graphic = locs.getObj('graphic', graphicId);
    if (!graphic) {
      conditionalLog('WARN', 'a paladin tried to toggle their aura for a token that does not exist');
      return null;
    }

    const characterId = graphic.get('represents');
    if (!characterId) {
      cache.set(graphicId, getGraphicInfoFromGraphic(graphic));
      return null;
    }

    const character = locs.getObj('character', characterId);
    if (!character) return null;

    const createCacheEntryForCharacter = (): void => {
      cache.set(graphicId, getCharacterInfoFromGraphicAndCharacter(graphic, character));
    };
    const npcAttrValue = locs.getAttrByName(characterId, 'npc');
    if (npcAttrValue === '1') {
      createCacheEntryForCharacter();
      return null;
    }

    const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
    if (!paladinClassAndLevel) {
      createCacheEntryForCharacter();
      return null;
    }

    const { levelAttr } = paladinClassAndLevel;
    const charismaAttr = locs.getAttrObjByName(characterId, 'charisma_mod');
    const hpAttr = locs.getAttrObjByName(characterId, 'hp');
    if (!charismaAttr || !hpAttr) {
      conditionalLog(
        'WARN',
        `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`
      );
      createCacheEntryForCharacter();
      return null;
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
      createCacheEntryForCharacter();
      return null;
    }

    const paladinInfo = {
      graphic,
      character: character,
      isNPC: false,
      attribute: {
        level: levelAttr,
        charisma: charismaAttr,
        hp: hpAttr,
        auraExceptions: auraExceptionsAttr,
      },
    };
    cache.set(graphicId, paladinInfo);
    return paladinInfo;
  };

  const auraExceptionsFromAttr = (auraExceptionsAttr: Attribute): [GraphicId, boolean][] =>
    auraExceptionsAttr
      .get('current')
      .split(',')
      .filter((propAndValueString) => propAndValueString)
      .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
      }) as [GraphicId, boolean][];

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

    const paladinDetails = getPaladinInfoFromGraphicOrNull(paladinGraphicId);
    if (!paladinDetails) {
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

  const findAndCachePaladinsForActivePages = (): void => {
    const uniqueActivePageIds = new Set(
      Object.entries(Campaign().get('playerspecificpages')).map(([, pageId]) => pageId)
    );

    const graphicsOnActivePages = Array.from(uniqueActivePageIds).flatMap((pageId) => {
      const page = locs.getObj('page', pageId);
      if (!page) return null;

      return locs.findObjs<'graphic'>({ _type: 'graphic', _pageid: pageId });
    });

    graphicsOnActivePages.forEach((graphic) => {
      if (graphic) getPaladinInfoFromGraphicOrNull(graphic.id);
    });
  };

  const createPaladinMacrosForCachedPaladins = (): void => {
    const abilityMacroAction = '!pa toggle @{selected|token_id} @{target|token_id}';

    const characterAbilityMacrosMap = locs
      .findObjs<'ability'>({ _type: 'ability', action: abilityMacroAction })
      .reduce((abilityMap, ability) => {
        abilityMap.set(ability.get('_characterid'), ability);
        return abilityMap;
      }, new Map<CharacterId, Ability>());

    Array.from(cache.entries()).forEach(([, info]: [GraphicId, GraphicInfo]) => {
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

  const startup = (): void => {
    findAndCachePaladinsForActivePages();
    conditionalLog('DEBUG', `finished caching, final results:\n---\n${Array.from(cache.entries()).join('\n')}\n---\n`);
    createPaladinMacrosForCachedPaladins();
    conditionalLog('DEBUG', 'finished creating ability macros for paladins');

    on('chat:message', chatObserver);
    // TODO assess this list of listeners
    // on('change:campaign:playerpageid', triggerPageLoad);
    // on('change:page', pageChange);
    // on('change:graphic', Token.update);
    // on('add:graphic', Token.addToken);
    // on('destroy:graphic', Token.removeToken);
    // on('change:attribute', Token.updateAttrs);
    conditionalLog('DEBUG', 'finished registering event handlers');

    log('-=> PaladinAura Ready <=-');
  };

  return {
    startup,
  };
})();

on('ready', PaladinAura.startup);
