/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */
const PaladinAura = (() => {
    // constants
    const APIName = 'PaladinAura';
    const auraExceptionsAttrName = 'paladin_aura_exceptions';
    const charismaBonusAttrName = 'charisma_mod';
    const hitpointsAttrName = 'hp';
    // user changable variables
    const auraBonusIconName = 'status_bolt-shield';
    const mode = 'DEBUG';
    // ---
    const cache = new Map();
    let locs;
    let campaign;
    let loadedPages = [];
    const importanceMap = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4,
    };
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
    const isTokenOnActivePage = (graphic) => graphic.get('_subtype') === 'token' &&
        graphic.get('layer') === 'objects' &&
        getUniqueActivePageIds().includes(graphic.get('_pageid'));
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
    const getStringNameAndIdMethodForGraphic = (graphic) => () => `${graphic.get('name')} (${graphic.id})`;
    const createGraphicInfoFromGraphic = (graphic) => ({
        graphic,
        isNPC: true,
        auraBonus: graphic.get(auraBonusIconName),
        getStringNameAndId: getStringNameAndIdMethodForGraphic(graphic),
    });
    const createCharacterInfoFromGraphicAndCharacter = (graphic, character) => ({
        ...createGraphicInfoFromGraphic(graphic),
        character,
        isNPC: isNpcFromGraphicId(graphic.id),
    });
    const createPaladinInfoFromGraphicCharacterAndAttributes = (graphic, character, attributes) => ({
        ...createGraphicInfoFromGraphic(graphic),
        ...createCharacterInfoFromGraphicAndCharacter(graphic, character),
        attribute: attributes,
        isNPC: false,
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
    const getCharacterFromGraphicOrNull = (graphic) => {
        const characterId = graphic.get('represents');
        if (!characterId)
            return null;
        const character = locs.getObj('character', characterId);
        if (!character)
            return null;
        return character;
    };
    const createAndCacheGraphicInfo = (graphic) => {
        const graphicInfo = createGraphicInfoFromGraphic(graphic);
        cache.set(graphic.id, graphicInfo);
        return graphicInfo;
    };
    const createAndCacheCharacterInfo = (graphic, character) => {
        const characterInfo = createCharacterInfoFromGraphicAndCharacter(graphic, character);
        cache.set(graphic.id, characterInfo);
        return characterInfo;
    };
    // TODO break out into other functions
    const getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull = (graphicId) => {
        const detailsFromCache = cache.get(graphicId);
        if (detailsFromCache)
            return detailsFromCache;
        const graphic = locs.getObj('graphic', graphicId);
        if (!graphic) {
            conditionalLog('WARN', 'a paladin tried to toggle their aura for a token that does not exist');
            return null;
        }
        const character = getCharacterFromGraphicOrNull(graphic);
        if (!character)
            return createAndCacheGraphicInfo(graphic);
        const characterId = character.id;
        const npcAttrValue = locs.getAttrByName(characterId, 'npc');
        if (npcAttrValue === '1')
            return createAndCacheCharacterInfo(graphic, character);
        const paladinClassAndLevel = getPaladinClassAndLevelAttrsOrNull(characterId);
        if (!paladinClassAndLevel)
            return createAndCacheCharacterInfo(graphic, character);
        const { levelAttr } = paladinClassAndLevel;
        const charismaBonusAttr = locs.getAttrObjByName(characterId, charismaBonusAttrName);
        const hpAttr = locs.getAttrObjByName(characterId, hitpointsAttrName);
        if (!charismaBonusAttr || !hpAttr) {
            conditionalLog('WARN', `a paladin was found with id ${characterId} but either the paladin's charisma or health attribute could not be found`);
            return createAndCacheCharacterInfo(graphic, character);
        }
        const auraExceptionsAttr = locs.getOrCreateAttrObjByName(characterId, auraExceptionsAttrName);
        if (!auraExceptionsAttr) {
            conditionalLog('WARN', "failed to get or create paladin's aura exceptions attribute");
            return createAndCacheCharacterInfo(graphic, character);
        }
        const paladinInfo = createPaladinInfoFromGraphicCharacterAndAttributes(graphic, character, {
            level: levelAttr,
            charismaBonus: charismaBonusAttr,
            hp: hpAttr,
            auraExceptions: auraExceptionsAttr,
        });
        cache.set(graphicId, paladinInfo);
        return paladinInfo;
    };
    const auraExceptionsFromAttr = (auraExceptionsAttr) => auraExceptionsAttr
        .get('current')
        .split(',')
        .filter((propAndValueString) => !!propAndValueString)
        .map((propAndValueString) => {
        const [graphicId, shouldApplyAuraString] = propAndValueString.split(':');
        return [graphicId, shouldApplyAuraString === 'true'];
    });
    const auraExceptionsToString = (auraExceptionsList) => auraExceptionsList.reduce((result, [id, applyAura]) => result + `,${id}:${applyAura}`, '').slice(1);
    const isNpcFromGraphicId = (graphicId) => {
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
        const paladinDetails = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(paladinGraphicId);
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
            const targetIsNPC = isNpcFromGraphicId(targetGraphicId);
            auraExceptionList.push([targetGraphicId, targetIsNPC]);
        }
        const newAuraExceptionsString = auraExceptionsToString(auraExceptionList);
        paladinDetails.attribute.auraExceptions.set('current', newAuraExceptionsString);
    };
    const cacheActivePagePaladinsAndUpdateLoadedPages = () => {
        const uniqueActivePageIds = getUniqueActivePageIds();
        cacheGraphicsForActivePagesAndApplyPaladinAuras(uniqueActivePageIds);
        unlistNoLongerLoadedPages(uniqueActivePageIds);
    };
    const findAndCacheGraphicsWithPageId = (pageId) => {
        const page = locs.getObj('page', pageId);
        if (!page) {
            conditionalLog('WARN', 'a player is listed as viewing a page that does not exist');
            return [];
        }
        const graphicsOnPage = locs.findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            _pageid: pageId,
        });
        return graphicsOnPage
            .map((graphic) => getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id))
            .filter((graphicInfo) => !!graphicInfo);
    };
    const findPaladinsFromGraphicArray = (graphicInfos) => graphicInfos.filter(isPaladinInfo);
    const getPaladinAuraRadiusInSquaresOrNull = (paladinInfo) => {
        if (+paladinInfo.attribute.hp.get('current') <= 0)
            return null;
        const level = +paladinInfo.attribute.level.get('current');
        if (level < 6)
            return null;
        if (level < 18)
            return 2;
        return 6;
    };
    // TODO break out to functions
    const applyPaladinAuraToGraphicInfoAuraBonuses = (paladinInfo, graphicInfos) => {
        conditionalLog('DEBUG', `applying aura for paladin '${paladinInfo.getStringNameAndId()}' to graphics [${graphicInfos.map((g) => g.getStringNameAndId())}]`);
        const auraRadiusInSquares = getPaladinAuraRadiusInSquaresOrNull(paladinInfo);
        if (!auraRadiusInSquares)
            return;
        const paladinAuraBonus = +paladinInfo.attribute.charismaBonus.get('current');
        const graphicsInRangeOfAura = graphicInfos.filter((graphicOnPageInfo) => {
            var _a, _b, _c, _d, _e;
            const auraExceptions = auraExceptionsFromAttr(paladinInfo.attribute.auraExceptions);
            const exception = (_a = auraExceptions.find(([graphicId]) => graphicId === graphicOnPageInfo.graphic.id)) === null || _a === void 0 ? void 0 : _a[1];
            const willGrantBonus = exception === true || (exception !== false && !graphicOnPageInfo.isNPC);
            const distanceBetweenTokensInSquares = (_e = (_d = (_c = (_b = Led.from(paladinInfo.graphic)) === null || _b === void 0 ? void 0 : _b.to(graphicOnPageInfo.graphic)) === null || _c === void 0 ? void 0 : _c.byPageDistance()) === null || _d === void 0 ? void 0 : _d.inSquares()) !== null && _e !== void 0 ? _e : Infinity;
            const withinAuraDistance = distanceBetweenTokensInSquares <= auraRadiusInSquares;
            conditionalLog('DEBUG', `AURA RESULT BETWEEN PALADIN '${paladinInfo.getStringNameAndId()}' AND TOKEN '${graphicOnPageInfo.getStringNameAndId()}':\nEXCEPTION LISTING: ${exception}\nWILL GRANT BONUS: ${willGrantBonus}\nFINAL DISTANCE BETWEEN TOKENS: ${distanceBetweenTokensInSquares}\nWITHIN AURA DISTANCE: ${withinAuraDistance}`);
            return willGrantBonus && withinAuraDistance;
        });
        graphicsInRangeOfAura.forEach((graphicRecievingBonusInfo) => {
            const oldBonusOrBool = graphicRecievingBonusInfo.auraBonus;
            if (typeof oldBonusOrBool !== 'number' || oldBonusOrBool < paladinAuraBonus)
                graphicRecievingBonusInfo.auraBonus = paladinAuraBonus;
        });
        conditionalLog('DEBUG', `apply aura results:\n- aura radius: ${auraRadiusInSquares}\n- aura bonus: ${paladinAuraBonus}\n- candidates: ${graphicsInRangeOfAura.map((g) => g.graphic.id)}`);
    };
    const findAndCachePaladinsWithPageIdAndApplyAuras = (pageId) => {
        conditionalLog('DEBUG', "called 'findAndCachePaladinsWithPageIdAndApplyAuras'");
        const graphicInfosForPage = findAndCacheGraphicsWithPageId(pageId);
        graphicInfosForPage.forEach((graphicInfo) => {
            graphicInfo.auraBonus = false;
        });
        const paladinInfosForPage = findPaladinsFromGraphicArray(graphicInfosForPage);
        paladinInfosForPage.forEach((paladinInfo) => {
            applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, graphicInfosForPage);
        });
        graphicInfosForPage.forEach((graphicInfo) => {
            conditionalLog('DEBUG', `gave token '${graphicInfo.getStringNameAndId()}' paladin aura bonus of ${graphicInfo.auraBonus}`);
            graphicInfo.graphic.set(auraBonusIconName, graphicInfo.auraBonus);
        });
    };
    const cacheGraphicsForActivePagesAndApplyPaladinAuras = (uniqueActivePageIds) => {
        conditionalLog('DEBUG', "called 'cacheGraphicsForActivePagesAndApplyPaladinAuras'");
        uniqueActivePageIds.forEach((pageId) => {
            if (!loadedPages.includes(pageId)) {
                findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
                loadedPages.push(pageId);
            }
        });
    };
    const unlistNoLongerLoadedPages = (uniqueActivePageIds) => {
        loadedPages = loadedPages.filter((pageId) => uniqueActivePageIds.includes(pageId));
    };
    const getUniqueActivePageIds = () => {
        const uniqueActivePageIds = Array.from(new Set([campaign.get('playerpageid'), ...Object.values(campaign.get('playerspecificpages'))]).values());
        conditionalLog('DEBUG', `unique active page ids: '${uniqueActivePageIds}'`);
        return uniqueActivePageIds;
    };
    const createPaladinMacrosForPaladinsInArray = (infoArray) => {
        conditionalLog('DEBUG', 'creating paladin ability macros');
        const abilityMacroAction = '!pa toggle @{selected|token_id} @{target|token_id}';
        const characterAbilityMacrosMap = locs
            .findObjs({ _type: 'ability', action: abilityMacroAction })
            .reduce((abilityMap, ability) => {
            abilityMap.set(ability.get('_characterid'), ability);
            return abilityMap;
        }, new Map());
        infoArray.forEach((info) => {
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
                conditionalLog('WARN', `failed to create ability macro for paladin ${info.getStringNameAndId()}`);
            else
                conditionalLog('INFO', `created ability macro for paladin ${info.getStringNameAndId()}`);
        });
    };
    const graphicCreatedCallback = (graphic) => {
        if (isTokenOnActivePage(graphic))
            return;
        const graphicInfo = getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull(graphic.id);
        if (!graphicInfo)
            return;
        createPaladinMacrosForPaladinsInArray([graphicInfo]);
        graphicChangeCallback(graphic);
    };
    const graphicChangeCallback = (graphic) => {
        conditionalLog('DEBUG', "called 'graphicChangeCallback'");
        if (!isTokenOnActivePage(graphic))
            return;
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
        }
        else {
            const allGraphicInfosOnPage = findAndCacheGraphicsWithPageId(pageId);
            const paladinInfosOnPage = findPaladinsFromGraphicArray(allGraphicInfosOnPage);
            paladinInfosOnPage.forEach((paladinInfo) => {
                applyPaladinAuraToGraphicInfoAuraBonuses(paladinInfo, [graphicInfo]);
            });
        }
    };
    const graphicDestroyCallback = (graphic) => {
        cache.delete(graphic.id);
    };
    const attributeChangeCallback = (attribute, oldAttribute) => {
        const attrName = attribute.get('name');
        if (attrName !== charismaBonusAttrName) {
            const current = +attribute.get('current');
            const old = +oldAttribute.current;
            if (current === old || (current > 0 && old > 0))
                return;
        }
        const uniqueActivePageIds = getUniqueActivePageIds();
        const pageIdsWithRepresentativeGraphics = new Set(locs
            .findObjs({
            _type: 'graphic',
            represents: attribute.get('_characterid'),
        })
            .map((graphic) => graphic.get('_pageid'))
            .filter((pageId) => uniqueActivePageIds.includes(pageId)));
        for (const pageId of pageIdsWithRepresentativeGraphics.values())
            findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
    };
    const pageChangeCallback = (page) => {
        if (getUniqueActivePageIds().includes(page.id))
            findAndCachePaladinsWithPageIdAndApplyAuras(page.id);
    };
    const chatObserver = (message) => {
        if (isApiMessage(message)) {
            const messageInfo = infoFromApiMessageOrNull(message);
            if (!messageInfo)
                return;
            const { graphicId1: paladinGraphicId, graphicId2: targetGraphicId } = messageInfo;
            toggleSelectedPaladinsAuraForTarget(paladinGraphicId, targetGraphicId);
            const uniqueActivePageIds = getUniqueActivePageIds();
            uniqueActivePageIds.forEach((pageId) => {
                findAndCachePaladinsWithPageIdAndApplyAuras(pageId);
            });
        }
        else if (isSimpleRoll(message)) {
            return;
        }
    };
    const registerEventHandlers = () => {
        on('chat:message', chatObserver);
        on('change:campaign:playerspecificpages', cacheActivePagePaladinsAndUpdateLoadedPages);
        on('change:campaign:playerpageid', cacheActivePagePaladinsAndUpdateLoadedPages);
        on('add:graphic', graphicCreatedCallback);
        on('change:graphic', graphicChangeCallback);
        on('destroy:graphic', graphicDestroyCallback);
        on('change:attribute', attributeChangeCallback);
        on('change:page', pageChangeCallback);
        conditionalLog('DEBUG', 'finished registering event handlers');
    };
    const initDependantVariables = () => {
        locs = Locs.new();
        campaign = Campaign();
    };
    const startup = () => {
        initDependantVariables();
        const uniqueActivePageIds = getUniqueActivePageIds();
        cacheGraphicsForActivePagesAndApplyPaladinAuras(uniqueActivePageIds);
        conditionalLog('DEBUG', `finished caching on all active pages, final results:\n---${Array.from(cache.entries())
            .map(([graphicId, graphicInfo]) => `\n${graphicId}: ${graphicInfo.getStringNameAndId()}`)
            .join('\n')}\n---`);
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
                getOrCreateAndCacheGraphicInfoFromGraphicIdOrNull,
                auraExceptionsFromAttr,
                auraExceptionsToString,
                isNpcFromGraphicId,
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
