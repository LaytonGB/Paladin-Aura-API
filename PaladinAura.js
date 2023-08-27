/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */
const PaladinAura = (() => {
    const APIName = 'PaladinAura';
    const importanceMap = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
    };
    const mode = 'DEBUG';
    const logImportanceLimit = importanceMap[mode];
    const conditionalLog = (importance, message) => {
        const importanceValue = importanceMap[importance];
        if (importanceValue >= logImportanceLimit) {
            if (importanceValue >= importanceMap.ERROR)
                sendChat(APIName, `/w gm ${importance}: ${message}`);
            log(`${APIName} ${importance}: ${message}`);
        }
    };
    const locs = Locs.new();
    const cache = new Map();
    const isApiMessage = (message) => message.type === 'api';
    const isSimpleRoll = (message) => message.rolltemplate === 'simple';
    const infoFromApiMessageOrNull = (message) => {
        conditionalLog('DEBUG', `message detected "${message.content}"`);
        const messageParts = message.content.split(/\s+/g);
        if (messageParts[0].toLowerCase() !== '!pa')
            return null;
        // more checks here if more commands ever get added
        if (messageParts.length !== 4 || messageParts[1].toLowerCase() !== 'toggle')
            return null;
        return {
            command: 'toggle',
            graphicId1: messageParts[2],
            graphicId2: messageParts[3],
        };
    };
    // TODO clean
    const getPaladinClassAndLevelAttrsOrNull = (characterId) => {
        const paladinClassName = 'Paladin';
        const primaryClassAttr = locs.getAttrObjByName(characterId, 'class');
        if ((primaryClassAttr === null || primaryClassAttr === void 0 ? void 0 : primaryClassAttr.get('current')) === paladinClassName) {
            const levelAttr = locs.getAttrObjByName(characterId, 'base_level');
            if (!levelAttr)
                return null;
            return { classAttr: primaryClassAttr, levelAttr };
        }
        const multiclassAttrNames = ['multiclass1', 'multiclass2', 'multiclass3'];
        const multiclassPaladinAttrOrUndefined = multiclassAttrNames
            .map((attrName) => {
            const multiclassFlagIsActive = locs.getAttrByName(characterId, attrName + '_flag') === '1';
            if (multiclassFlagIsActive)
                return locs.getAttrObjByName(characterId, attrName);
        })
            .find((paladinClassAttrOrFalsy) => (paladinClassAttrOrFalsy === null || paladinClassAttrOrFalsy === void 0 ? void 0 : paladinClassAttrOrFalsy.get('current')) === paladinClassName);
        if (!multiclassPaladinAttrOrUndefined)
            return null;
        const levelAttrName = multiclassPaladinAttrOrUndefined.get('name') + '_lvl';
        const levelAttr = locs.getAttrObjByName(characterId, levelAttrName);
        if (!levelAttr)
            return null;
        return { classAttr: multiclassPaladinAttrOrUndefined, levelAttr };
    };
    const paladinDetailsFromGraphicIdOrNull = (graphicId) => {
        const paladinDetailsFromCache = cache.get(graphicId);
        if (paladinDetailsFromCache)
            return paladinDetailsFromCache;
        const graphic = locs.getObj('graphic', graphicId);
        if (!graphic)
            return null;
        const characterId = graphic.get('represents');
        if (!characterId)
            return null;
        const character = locs.getObj('character', characterId);
        if (!character)
            return null;
        const npcAttr = locs.getAttrObjByName(characterId, 'npc');
        if ((npcAttr === null || npcAttr === void 0 ? void 0 : npcAttr.get('current')) === '1')
            return null;
        const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
        if (!paladinClassAndLevel)
            return null;
        const { levelAttr } = paladinClassAndLevel;
        const charismaAttr = locs.getAttrObjByName(characterId, 'charisma_mod');
        const hpAttr = locs.getAttrObjByName(characterId, 'hp');
        if (!charismaAttr || !hpAttr)
            return null;
        const auraExceptionsAttrName = 'paladin_aura_exceptions';
        const auraExceptionsAttr = locs.getAttrObjByName(characterId, auraExceptionsAttrName) ||
            locs.createObj('attribute', {
                name: auraExceptionsAttrName,
                _characterid: characterId,
                current: '',
            });
        if (!auraExceptionsAttr) {
            conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
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
    const auraExceptionsFromAttr = (auraExceptionsAttr) => auraExceptionsAttr
        .get('current')
        .split(',')
        .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
    });
    const auraExceptionsToString = (auraExceptionsList) => auraExceptionsList.reduce((result, [id, applyAura]) => result + `,${id}:${applyAura}`, '');
    const graphicIsNPC = (graphicId) => {
        const graphic = locs.getObj('graphic', graphicId);
        if (!graphic)
            return true;
        const characterId = graphic.get('represents');
        if (!characterId)
            return true;
        return locs.getAttrByName(characterId, 'npc') === '1';
    };
    const toggleSelectedPaladinsAuraForTarget = (paladinGraphicId, targetGraphicId) => {
        conditionalLog('DEBUG', `attempting to toggle graphic "${paladinGraphicId}" aura for target "${targetGraphicId}"`);
        const paladinDetails = paladinDetailsFromGraphicIdOrNull(paladinGraphicId);
        if (!paladinDetails) {
            conditionalLog('WARN', 'only paladins can toggle aura targets. Make sure the selected token represents a paladin');
            return;
        }
        const auraExceptionList = auraExceptionsFromAttr(paladinDetails.attribute.auraExceptions);
        const existingExceptionIndex = auraExceptionList.findIndex(([id]) => id === targetGraphicId);
        if (existingExceptionIndex !== -1) {
            auraExceptionList[existingExceptionIndex][1] = !auraExceptionList[existingExceptionIndex][1];
        }
        else {
            const targetIsNPC = graphicIsNPC(targetGraphicId);
            auraExceptionList.push([targetGraphicId, targetIsNPC]);
        }
        const newAuraExceptionsString = auraExceptionsToString(auraExceptionList);
        paladinDetails.attribute.auraExceptions.set('current', newAuraExceptionsString);
    };
    const chatObserver = (message) => {
        if (isApiMessage(message)) {
            const messageInfo = infoFromApiMessageOrNull(message);
            if (!messageInfo)
                return;
            const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
            toggleSelectedPaladinsAuraForTarget(paladinGraphicId, targetGraphicId);
        }
        else if (isSimpleRoll(message)) {
            return;
        }
    };
    const startup = () => {
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
