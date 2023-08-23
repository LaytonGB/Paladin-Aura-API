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

type GraphicId = Roll20Id;

interface SimpleRollData extends ChatEventData {
  rolltemplate: 'simple';
}

interface ApiMessageInfo {
  command: 'toggle';
  graphicId1: Roll20Id;
  graphicId2: Roll20Id;
}

interface CharacterInfo {
  graphic: Graphic;
  _characterid: Roll20Id;
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
  const locs = Locs.new();

  const cache = new Map<GraphicId, PaladinInfo>();

  const isApiMessage = (message: ChatEventData): message is ApiChatEventData => {
    return message.type === 'api';
  };

  const isSimpleRoll = (message: ChatEventData): message is SimpleRollData => {
    return message.rolltemplate === 'simple';
  };

  const infoFromApiMessageOrNull = (message: ApiChatEventData): ApiMessageInfo | null => {
    const messageParts = message.content.split(/\s+/g);
    if (messageParts[0].toLowerCase() !== '!pa') {
      return null;
    }

    // more checks here if more commands ever get added
    if (messageParts.length !== 4 || messageParts[1].toLowerCase() !== 'toggle') {
      return null;
    }

    return {
      command: 'toggle',
      graphicId1: messageParts[2],
      graphicId2: messageParts[3],
    };
  };

  // TODO clean
  const getPaladinClassAndLevelAttrsOrNull = (
    characterId: Roll20Id
  ): { classAttr: Attribute; levelAttr: Attribute } | null => {
    const primaryClassAttr = locs.getAttrObjByName(characterId, 'class');
    if (primaryClassAttr?.get('current') === 'paladin') {
      const levelAttr = locs.getAttrObjByName(characterId, 'base_level');
      if (!levelAttr) {
        return null;
      }

      return { classAttr: primaryClassAttr, levelAttr };
    }

    const multiclassAttrNames = ['multiclass1', 'multiclass2', 'multiclass3'];
    const multiclassPaladinAttrOrUndefined = multiclassAttrNames
      .map((attrName) => {
        const multiclassFlagIsActive = locs.getAttrByName(characterId, attrName + '_flag') === '1';
        if (multiclassFlagIsActive) {
          return locs.getAttrObjByName(characterId, attrName);
        }
      })
      .find((paladinClassAttrOrFalsy) => paladinClassAttrOrFalsy?.get('current') === 'paladin');

    if (!multiclassPaladinAttrOrUndefined) {
      return null;
    }

    const levelAttrName = multiclassPaladinAttrOrUndefined.get('name') + '_lvl';
    const levelAttr = locs.getAttrObjByName(characterId, levelAttrName);
    if (!levelAttr) {
      return null;
    }

    return { classAttr: multiclassPaladinAttrOrUndefined, levelAttr };
  };

  const paladinDetailsFromGraphicIdOrNull = (graphicId: Roll20Id): PaladinInfo | null => {
    const paladinDetailsFromCache = cache.get(graphicId);
    if (paladinDetailsFromCache) {
      return paladinDetailsFromCache;
    }

    const graphic = locs.getObj('graphic', graphicId);
    if (!graphic) {
      return null;
    }

    const characterId = graphic.get('represents');
    if (!characterId) {
      return null;
    }

    const character = locs.getObj('character', characterId);
    if (!character) {
      return null;
    }

    const npcAttr = locs.getAttrObjByName(characterId, 'npc');
    if (npcAttr?.get('current') === '1') {
      return null;
    }

    const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
    if (!paladinClassAndLevel) {
      return null;
    }

    const { levelAttr } = paladinClassAndLevel;
    const charismaAttr = locs.getAttrObjByName(characterId, 'charisma_mod');
    const hpAttr = locs.getAttrObjByName(characterId, 'hp');
    if (!charismaAttr || !hpAttr) {
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
      return null;
    }

    return {
      graphic,
      _characterid: characterId,
      isNPC: false,
      attribute: {
        level: levelAttr,
        charisma: charismaAttr,
        hp: hpAttr,
        auraExceptions: auraExceptionsAttr,
      },
    };
  };

  const auraExceptionsFromAttr = (auraExceptionsAttr: Attribute): [GraphicId, boolean][] => {
    return auraExceptionsAttr
      .get('current')
      .split(',')
      .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
      });
  };

  const auraExceptionsToString = (auraExceptionsList: [GraphicId, boolean][]): string => {
    return auraExceptionsList.reduce(
      (result, [id, applyAura]) => result + `,${id}:${applyAura}`,
      ''
    );
  };

  const graphicIsNPC = (graphicId: GraphicId): boolean => {
    const graphic = locs.getObj('graphic', graphicId);
    if (!graphic) {
      return true;
    }

    const characterId = graphic.get('represents');
    if (!characterId) {
      return true;
    }

    return locs.getAttrByName(characterId, 'npc') === '1';
  };

  const toggleAuraForTarget = (paladinGraphicId: Roll20Id, targetGraphicId: Roll20Id): void => {
    const paladinDetails = paladinDetailsFromGraphicIdOrNull(paladinGraphicId);
    if (!paladinDetails) {
      log(
        'PaladinAura Error: Only paladins can toggle aura targets. Make sure the selected token represents a paladin.'
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

  const chatObserver = (message: ChatEventData): void => {
    if (isApiMessage(message)) {
      const messageInfo = infoFromApiMessageOrNull(message);
      if (!messageInfo) {
        return;
      }

      const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
      toggleAuraForTarget(paladinGraphicId, targetGraphicId);
    } else if (isSimpleRoll(message)) {
      return;
    }
  };

  const startup = (): void => {
    on('chat:message', chatObserver);
    // TODO assess this list of listeners
    // on('change:campaign:playerpageid', triggerPageLoad);
    // on('change:page', pageChange);
    // on('change:graphic', Token.update);
    // on('add:graphic', Token.addToken);
    // on('destroy:graphic', Token.removeToken);
    // on('change:attribute', Token.updateAttrs);
    log('-=> PaladinAura Ready <=-');
  };

  return {
    startup,
  };
})();

on('ready', PaladinAura.startup);
