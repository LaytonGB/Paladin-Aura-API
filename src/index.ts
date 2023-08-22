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

interface SimpleRollData extends ChatEventData {
  rolltemplate: 'simple';
}

interface ApiMessageInfo {
  command: 'toggle';
  graphicId1: Roll20Id;
  graphicId2: Roll20Id;
}

interface GraphicInfo {
  get: Graphic['get'];
  id: Roll20Id;
  top: number;
  left: number;
  height: number;
  width: number;
}

interface CharacterInfo {
  graphic: GraphicInfo;
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
  auraExceptions: [string, boolean][];
}

interface IPaladinAura {
  startup: () => void;
}

export const PaladinAura = ((): IPaladinAura => {
  const locs = Locs.new();

  const isApiMessage = (
    message: ChatEventData
  ): message is ApiChatEventData => {
    return message.type === 'api';
  };

  const isSimpleRoll = (message: ChatEventData): message is SimpleRollData => {
    return message.rolltemplate === 'simple';
  };

  const infoFromApiMessageOrNull = (
    message: ApiChatEventData
  ): ApiMessageInfo | null => {
    const messageParts = message.content.split(/\s+/g);
    if (messageParts[0].toLowerCase() !== '!pa') {
      return null;
    }

    // more checks here if more commands ever get added
    if (
      messageParts.length !== 4 ||
      messageParts[1].toLowerCase() !== 'toggle'
    ) {
      return null;
    }

    return {
      command: 'toggle',
      graphicId1: messageParts[2],
      graphicId2: messageParts[3],
    };
  };

  const paladinDetailsFromGraphicIdOrNull = (
    graphicId: Roll20Id
  ): PaladinInfo | null => {
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
  };

  const toggleAuraForTarget = (
    paladinGraphicId: Roll20Id,
    targetGraphicId: Roll20Id
  ): void => {
    const paladinDetails = paladinDetailsFromGraphicIdOrNull(paladinGraphicId);
    if (!paladinDetails) {
      return;
    }
  };

  const chatObserver = (message: ChatEventData): void => {
    if (isApiMessage(message)) {
      const messageInfo = infoFromApiMessageOrNull(message);
      if (!messageInfo) {
        return;
      }

      const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } =
        messageInfo;
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
