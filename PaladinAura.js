/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */
const PaladinAura = (() => {
    const APIName = 'PaladinAura';
    const locs = Locs.new();
    const cache = new Map();
    const campaign = Campaign();
    let loadedPages = [];
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
    const isPaladinInfo = (info) => !!info.attribute;
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
    const getGraphicInfoFromGraphic = (graphic) => ({ graphic, isNPC: true });
    const getCharacterInfoFromGraphicAndCharacter = (graphic, character) => ({
        graphic,
        character,
        isNPC: locs.getAttrByName(character.id, 'npc') === '1',
    });
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
    // TODO break out into other functions
    const getAndCacheInfoFromGraphicOrNull = (graphicId) => {
        const detailsFromCache = cache.get(graphicId);
        if (detailsFromCache)
            return detailsFromCache;
        const graphic = locs.getObj('graphic', graphicId);
        if (!graphic) {
            conditionalLog('WARN', 'a paladin tried to toggle their aura for a token that does not exist');
            return null;
        }
        const getAndCacheGraphicInfo = () => {
            const graphicInfo = getGraphicInfoFromGraphic(graphic);
            cache.set(graphicId, graphicInfo);
            return graphicInfo;
        };
        const characterId = graphic.get('represents');
        if (!characterId)
            return getAndCacheGraphicInfo();
        const character = locs.getObj('character', characterId);
        if (!character)
            return getAndCacheGraphicInfo();
        const getAndCacheCharacterInfo = () => {
            const characterInfo = getCharacterInfoFromGraphicAndCharacter(graphic, character);
            cache.set(graphicId, characterInfo);
            return characterInfo;
        };
        const npcAttrValue = locs.getAttrByName(characterId, 'npc');
        if (npcAttrValue === '1')
            return getAndCacheCharacterInfo();
        const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
        if (!paladinClassAndLevel)
            return getAndCacheCharacterInfo();
        const { levelAttr } = paladinClassAndLevel;
        const charismaAttr = locs.getAttrObjByName(characterId, 'charisma_mod');
        const hpAttr = locs.getAttrObjByName(characterId, 'hp');
        if (!charismaAttr || !hpAttr) {
            conditionalLog('WARN', `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`);
            return getAndCacheCharacterInfo();
        }
        const auraExceptionsAttrName = 'paladin_aura_exceptions';
        const auraExceptionsAttr = locs.getAttrObjByName(characterId, auraExceptionsAttrName) ||
            locs.createObj('attribute', {
                name: auraExceptionsAttrName,
                _characterid: characterId,
                current: '',
            });
        if (!auraExceptionsAttr) {
            conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
            return getAndCacheCharacterInfo();
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
    const auraExceptionsFromAttr = (auraExceptionsAttr) => auraExceptionsAttr
        .get('current')
        .split(',')
        .filter((propAndValueString) => propAndValueString)
        .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
    });
    const auraExceptionsToString = (auraExceptionsList) => auraExceptionsList.reduce((result, [id, applyAura]) => result + `,${id}:${applyAura}`, '').slice(1);
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
        const paladinDetails = getAndCacheInfoFromGraphicOrNull(paladinGraphicId);
        if (!paladinDetails || !isPaladinInfo(paladinDetails)) {
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
    const cacheActivePagePaladinsAndUpdateLoadedPages = () => {
        const uniqueActivePageIds = getUniqueActivePageIds();
        cacheGraphicsForActivePages(uniqueActivePageIds);
        unlistNoLongerLoadedPages(uniqueActivePageIds);
    };
    const findAndCachePaladinsWithPageId = (pageId) => {
        const page = locs.getObj('page', pageId);
        if (!page) {
            conditionalLog('WARN', 'a player is listed as viewing a page that does not exist');
            return;
        }
        const graphicsOnPage = locs.findObjs({ _type: 'graphic', _pageid: pageId });
        graphicsOnPage.forEach((graphic) => {
            if (graphic)
                getAndCacheInfoFromGraphicOrNull(graphic.id);
        });
    };
    const cacheGraphicsForActivePages = (uniqueActivePageIds) => {
        uniqueActivePageIds.forEach((pageId) => {
            if (!loadedPages.includes(pageId))
                findAndCachePaladinsWithPageId(pageId);
        });
    };
    const unlistNoLongerLoadedPages = (uniqueActivePageIds) => {
        loadedPages = loadedPages.filter((pageId) => uniqueActivePageIds.includes(pageId));
    };
    const getUniqueActivePageIds = () => Array.from(new Set(Object.entries(campaign.get('playerspecificpages')).map(([, pageId]) => pageId)).values());
    const createPaladinMacrosForCachedPaladins = () => {
        const abilityMacroAction = '!pa toggle @{selected|token_id} @{target|token_id}';
        const characterAbilityMacrosMap = locs
            .findObjs({ _type: 'ability', action: abilityMacroAction })
            .reduce((abilityMap, ability) => {
            abilityMap.set(ability.get('_characterid'), ability);
            return abilityMap;
        }, new Map());
        Array.from(cache.entries()).forEach(([, info]) => {
            if (!isPaladinInfo(info))
                return;
            const existingAbilityMacro = characterAbilityMacrosMap.get(info.character.id);
            if (existingAbilityMacro)
                return;
            const createdAbilityMacro = locs.createObj('ability', {
                _characterid: info.character.id,
                name: 'Toggle aura for target',
                description: 'Toggle your paladin aura for the selected target.',
                action: abilityMacroAction,
                istokenaction: true,
            });
            if (!createdAbilityMacro)
                conditionalLog('WARN', `failed to create ability macro for paladin ${info.character.id}`);
            else
                conditionalLog('INFO', `created ability macro for paladin ${info.character.id}`);
        });
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
    const registerEventHandlers = () => {
        // TODO assess this list of listeners
        on('chat:message', chatObserver);
        on('change:campaign:playerspecificpages', cacheActivePagePaladinsAndUpdateLoadedPages);
        // on('change:graphic', Token.update);
        // on('add:graphic', Token.addToken);
        // on('destroy:graphic', Token.removeToken);
        // on('change:attribute', Token.updateAttrs);
        conditionalLog('DEBUG', 'finished registering event handlers');
    };
    const startup = () => {
        const uniqueActivePageIds = getUniqueActivePageIds();
        cacheGraphicsForActivePages(uniqueActivePageIds);
        conditionalLog('DEBUG', `finished caching on all active pages, final results:\n---\n${Array.from(cache.entries()).join('\n')}\n---\n`);
        createPaladinMacrosForCachedPaladins();
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
