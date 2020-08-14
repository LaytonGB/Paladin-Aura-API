"use strict";
/**
 * Paladin Aura API
 */
// TODO Add comments
// TODO Test creature sizes
// FIXME Page changes are not working correctly
// TODO Test page changes
// FIXME Test with tokens that have no sheets
// FIXME Tokens being added / removed are not logging properly
const PaladinAura = (() => {
    // ANCHOR State object structure
    /*
        state.PaladinAura = {
            TokenList: { [id: string]: TokenObj },
            PaladinList: string[],
            PageLoad: boolean,
        }

        globalconfig.PaladinAura = {
            DiagonalMeasurementMethod: "auto" | "foure" | "threefive" | "pythagorean" | "manhattan",
            ModifyAttributes: boolean,
        }
    */
    // FIXME BEFORE RELEASE remove this globalconfig
    const globalconfig = {
        DiagonalMeasurementMethod: 'auto',
        ModifyAttributes: false,
    };
    // ANCHOR Class definitions
    class TokenObj {
        constructor(token) {
            this.ID = token.id;
            this.xPos = token.get('left');
            this.yPos = token.get('top');
            this.xSize = token.get('width');
            this.ySize = token.get('height');
            const character = getObj('character', token.get('represents'));
            if (character !== undefined) {
                this.characterID = character.id;
                this.isNPC = this.characterID === undefined ||
                    getAttrByName(character.id, 'npc') === '1';
                if (this.isNPC === false) {
                    const paladinClass = charIsPaladin(this.characterID);
                    if (paladinClass !== false) {
                        this.paladinProps = new PaladinProps(token, paladinClass);
                        Paladin.initFromStoredInclusionList(this);
                        STATE.PaladinList.push(token.id);
                    }
                }
            }
            else {
                this.isNPC = true;
            }
        }
    }
    class PaladinProps {
        constructor(token, paladinClass) {
            this.characterID = token.get('represents');
            if (paladinClass === true) {
                const base_level = getAttrID('base_level', this.characterID);
                if (base_level === undefined) {
                    // FIXME Multiclassing doesn't work atm
                    this.levelAttrID = getAttrID('level', this.characterID);
                }
                else {
                    this.levelAttrID = base_level;
                }
            }
            else {
                this.levelAttrID = getAttrID(paladinClass, this.characterID);
            }
            this.chaBonusAttrID = getAttrID('charisma_mod', this.characterID);
            this.hpAttrID = getAttrID('hp', this.characterID);
            this.forceIncludeAttrID = getAttrID('PAForceInclude', this.characterID);
            if (this.forceIncludeAttrID !== undefined) {
                const forceIncludeAttr = getAttrFromID(this.forceIncludeAttrID);
                if (forceIncludeAttr !== undefined) {
                    const forceIncludeStr = forceIncludeAttr.get('current');
                    if (forceIncludeStr.trim().length > 0) {
                        this.forceIncludeArr = forceIncludeStr.split(',').map(a => {
                            const parts = a.split('|');
                            return [parts[0], (+parts[1])];
                        });
                    }
                }
            }
            // Add paladin abilities to character
            const abilities = findObjs({
                _type: 'ability',
                _characterid: this.characterID,
            });
            // Get an array of abilities that do not already exist
            const abilitiesToCreate = Paladin.paladinAbilities().filter(a => {
                return !abilities.some(b => { return a[0] === b.get('name'); });
            });
            abilitiesToCreate.forEach(a => {
                createObj('ability', {
                    _characterid: this.characterID,
                    name: a[0],
                    action: a[1],
                    istokenaction: true,
                });
            });
        }
    }
    // ANCHOR Global variables
    const DiagonalMeasurementMethod = globalconfig.DiagonalMeasurementMethod;
    const ModifyAttributes = globalconfig.ModifyAttributes;
    const StatusMarker = 'status_bolt-shield';
    // ANCHOR Input handling
    function handleInput(msg) {
        if (msg.type === 'api') {
            const parts = msg.content.split(' ');
            if (parts[0] === '!pa') {
                // '!pa toggle @{selected|id} @{target|id}'
                if (parts[1] === 'toggle' && parts[2] && parts[3]) {
                    Paladin.toggleAuraForTarget(parts[2], parts[3]);
                }
                // ANCHOR Debug commands
                else if (parts[1] === 'debug') {
                    log('=== state.PaladinAura.TokenList ===');
                    Object.keys(STATE.get('TokenList')).forEach((k) => {
                        const t = STATE.get('TokenList', k);
                        const token = getObj('graphic', t.ID);
                        log('= TokenID: ' + t.ID + ' =');
                        if (token !== undefined) {
                            log('Name: ' + token.get('name'));
                        }
                        if (t.characterID !== undefined) {
                            log('isPaladin: ' + charIsPaladin(t.characterID));
                        }
                        else {
                            log('Has no character sheet.');
                        }
                    });
                    log(`PaladinList: ${STATE.PaladinList.get().toString()}`);
                }
            }
        }
    }
    // ANCHOR Global functions
    function getAttrID(name, characterID) {
        const attrs = findObjs({
            _type: 'attribute',
            _characterid: characterID,
            name: name,
        });
        if (attrs === undefined || attrs[0] === undefined) {
            return undefined;
        }
        return attrs[0].id;
    }
    function getAttrFromID(id) {
        if (id === undefined) {
            return undefined;
        }
        else {
            const attr = getObj('attribute', id);
            if (attr === undefined) {
                return undefined;
            }
            else {
                return attr;
            }
        }
    }
    /**
     * Test if a character has any levels in paladin and returns different values
     * based on whether the character is a multi-classed paladin.
     *
     * If the character is not a multiclassed paladin, returns `true` or `false` if they
     * are or are not a paladin respectively. If the character is a multiclassed paladin,
     * `'multiclass' + <number>` will be returned as the name of the attribute the class
     * is stored in.
     * @param CharID The targeted character.
     */
    function charIsPaladin(charID) {
        const multiclasses = [];
        const classesToCheck = ['class'];
        ['multiclass1', 'multiclass2', 'multiclass3'].forEach(a => {
            multiclasses.push(getAttrByName(charID, a + '_flag'));
        });
        multiclasses.forEach(a => {
            if (a === '1') {
                classesToCheck.push(a);
            }
        });
        const palClass = classesToCheck.find(c => {
            const val = getAttrByName(charID, c);
            return val.search(/paladin/gi) !== -1;
        });
        if (palClass === 'class')
            return true;
        else if (palClass !== undefined)
            return palClass;
        else
            return false;
    }
    /**
     * Calculates and sets the aura bonus for all tokens.
     */
    function calcAllBonuses() {
        Object.keys(STATE.get('TokenList')).forEach(k => {
            const tokenObj = STATE.get('TokenList', k);
            Token.setBonus(tokenObj, Token.calcBonus(tokenObj));
        });
    }
    /**
     * Get and clear the TokenList.
     */
    function clearTokenList() {
        Object.keys(STATE.get('TokenList')).forEach(k => {
            const tokenObj = STATE.get('TokenList', k);
            Token.setBonus(tokenObj, 0);
        });
    }
    /**
     * Returns the distance between two points in pixels.
     *
     * Automatically accounts for sizes of tokens.
     * @param token A `TokenObj` that represents the token that may receive a paladin aura bonus.
     * @param paladin A `TokenObj` that represents the paladin that may be granting an aura bonus.
     */
    function getDistance(token, paladin) {
        const txPos = token.xPos;
        const tyPos = token.yPos;
        const txSize = token.xSize;
        const tySize = token.ySize;
        const pxPos = paladin.xPos;
        const pyPos = paladin.yPos;
        const pxSize = paladin.xSize;
        const pySize = paladin.ySize;
        const pageID = Campaign().get('playerpageid');
        const page = getObj('page', pageID);
        if (page !== undefined) {
            const pixPerSquare = page.get('snapping_increment') * 70;
            const grid_type = page.get('grid_type');
            const scale_units = page.get('scale_units');
            if (grid_type === 'square' && scale_units === 'ft') {
                // FIXME Does not work for re-sized paladins
                // EDIT Works for Large+ paladins... is weird for small ones?
                const txAdjust = txSize <= pixPerSquare ? 0 : (txSize - pixPerSquare) / 2;
                const tyAdjust = tySize <= pixPerSquare ? 0 : (tySize - pixPerSquare) / 2;
                const pxAdjust = pxSize === pixPerSquare ? 0 :
                    pxSize > pixPerSquare ? (pxSize - pixPerSquare) / 2 : ((pixPerSquare - pxSize) / 2);
                const pyAdjust = pySize === pixPerSquare ? 0 :
                    pySize > pixPerSquare ? (pySize - pixPerSquare) / 2 : ((pixPerSquare - pySize) / 2);
                const xDif = Math.abs(txPos - pxPos);
                const yDif = Math.abs(tyPos - pyPos);
                const dist1 = xDif >= yDif ?
                    Math.max(xDif - txAdjust - pxAdjust, 0) :
                    Math.max(yDif - tyAdjust - pyAdjust, 0);
                const dist2 = xDif >= yDif ?
                    Math.max(yDif - tyAdjust - pyAdjust, 0) :
                    Math.max(xDif - txAdjust - pxAdjust, 0);
                log(`xDif: ${xDif} | yDif: ${yDif}`);
                // If the measurement method is set to 'auto' use the page setting,
                // unless the page is undefined - then use pythagorean.
                let measurementMethod;
                if (DiagonalMeasurementMethod === 'auto') {
                    if (page === undefined) {
                        log('Player page is undefined.');
                        measurementMethod = 'pythagorean';
                    }
                    else {
                        measurementMethod = page.get('diagonaltype');
                    }
                }
                else {
                    measurementMethod = DiagonalMeasurementMethod;
                }
                switch (measurementMethod) {
                    case 'foure':
                        // Return the largest distance
                        return dist1;
                    case 'threefive':
                        // Return larger distance + 1/2 smaller distance rounded down to grid
                        return dist1 + (Math.floor(dist2 / pixPerSquare / 2) * pixPerSquare);
                    case 'pythagorean':
                        // Return exact distance, rounded to grid
                        return Math.round(Math.sqrt(((dist1 ^ 2) + (dist2 ^ 2)) / pixPerSquare)) * pixPerSquare;
                    case 'manhattan':
                        // Return the sum of distances
                        return dist1 + dist2;
                    default:
                        log('function getDistance error - measurementMethod is invalid.');
                }
            }
        }
        else {
            return undefined;
        }
    }
    /**
     * Tests if the current page is compatible with the API.
     */
    function checkPage() {
        const page = getObj('page', Campaign().get('playerpageid'));
        if (page === undefined)
            return false;
        let grid_type = '';
        let scale_units = '';
        if (page !== undefined) {
            grid_type = page.get('grid_type');
            scale_units = page.get('scale_units');
        }
        if (page !== undefined && grid_type === 'square' && scale_units === 'ft') {
            return true;
        }
        else {
            log('= Current page is not compatible with PaladinAura due to the following settings: =');
            if (page === undefined)
                log('page: undefined');
            if (grid_type !== 'square')
                log('grid_type: not "square"');
            if (scale_units !== 'ft')
                log('scale_units: not "ft"');
        }
        return false;
    }
    /**
     * Returns true if the provided graphic is an NPC.
     * @param Graphic targeted graphics object.
     */
    function tokenIsNPC(token) {
        const charID = token.get('represents');
        if (charID === undefined)
            return true;
        else {
            const character = getObj('character', charID);
            if (character === undefined)
                return true;
            else {
                return getAttrByName(charID, 'npc') === '1';
            }
        }
    }
    // SECTION Function objects
    // ANCHOR State object
    const STATE = {
        get(val1, val2, val3) {
            if (val2 === undefined && val3 === undefined) {
                return state.PaladinAura[val1];
            }
            else if (val2 !== undefined && val3 === undefined) {
                return state.PaladinAura[val1][val2];
            }
            else if (val2 !== undefined && val3 !== undefined) {
                return state.PaladinAura[val1][val2][val3];
            }
            else {
                return undefined;
            }
        },
        set(newVal, val1, val2, val3) {
            if (val2 === undefined && val3 === undefined) {
                state.PaladinAura[val1] = newVal;
            }
            else if (val2 !== undefined && val3 === undefined) {
                state.PaladinAura[val1][val2] = newVal;
            }
            else if (val2 !== undefined && val3 !== undefined) {
                state.PaladinAura[val1][val2][val3] = newVal;
            }
        },
        delete(val1, val2, val3) {
            if (val2 === undefined && val3 === undefined) {
                delete state.PaladinAura[val1];
            }
            else if (val2 !== undefined && val3 === undefined) {
                delete state.PaladinAura[val1][val2];
            }
            else if (val2 !== undefined && val3 !== undefined) {
                delete state.PaladinAura[val1][val2][val3];
            }
        },
        PaladinList: {
            /**
             * Only use this function to add one-offs to the `PaladinList`.
             *
             * For larger operations use `get()` and `set()` or `modify()`.
             * @param paladinID A paladin ID.
             */
            push(paladinID) {
                const arr = Array.from(state.PaladinAura.PaladinList);
                arr.push(paladinID);
                STATE.PaladinList.set(arr);
            },
            /**
             * Only use this function to remove one-offs from the `PaladinList`.
             *
             * For larger operations use `get()` and `set()` or `modify()`.
             * @param paladinID The ID of the paladin to be removed.
             */
            remove(paladinID) {
                const palList = Array.from(state.PaladinAura.PaladinList);
                const index = palList.findIndex(pID => { return pID === paladinID; });
                if (index !== -1) {
                    STATE.PaladinList.set(palList.splice(index, 1));
                    // // Remove the token's character's paladin abilities
                    // const tokenObj = STATE.get('TokenList', paladinID) as TokenObj | undefined;
                    // if (tokenObj !== undefined && tokenObj.characterID !== undefined) {
                    //     const abilities = findObjs({
                    //         _type: 'ability',
                    //         _characterid: paladinID,
                    //     }) as Ability[];
                    //     const abilitiesToRemove = abilities.filter(a => {
                    //         return Paladin.paladinAbilities().some(b => { return b[0] === a.get('name'); });
                    //     });
                    //     abilitiesToRemove.forEach(a => {
                    //         a.remove();
                    //     });
                    // }
                    calcAllBonuses();
                }
            },
            get() {
                return Array.from(state.PaladinAura.PaladinList);
            },
            set(strArr) {
                state.PaladinAura.PaladinList = strArr;
            },
            modify({ add, remove }) {
                const input = add !== undefined || remove !== undefined;
                let palList = [];
                if (input) {
                    palList = STATE.PaladinList.get();
                }
                if (add !== undefined) {
                    add.forEach(id => {
                        palList.push(id);
                    });
                }
                if (remove !== undefined) {
                    remove.forEach(id => {
                        const index = palList.findIndex(e => { return e === id; });
                        if (index !== -1) {
                            palList = palList.splice(index, 1);
                        }
                    });
                }
                if (input) {
                    STATE.PaladinList.set(palList);
                }
            },
            clear() {
                log('PaladinList cleared.');
                state.PaladinAura.PaladinList = [];
            },
        },
    };
    // ANCHOR Token object
    const Token = {
        addToken(token) {
            if (token.get('_subtype') === 'token') {
                const tokenObj = new TokenObj(token);
                STATE.set(tokenObj, 'TokenList', token.id);
                return tokenObj;
            }
            return undefined;
        },
        removeToken(token) {
            const tokenID = token.id || token.ID;
            if (STATE.get('TokenList', tokenID) !== undefined) {
                STATE.PaladinList.remove(tokenID);
                STATE.delete('TokenList', tokenID);
            }
        },
        getOrAddTokenObj(token) {
            let tObj = STATE.get('TokenList', token.id);
            if (tObj === undefined) {
                tObj = new TokenObj(token);
                STATE.set(tObj, 'TokenList', token.id);
            }
            return tObj;
        },
        setBonus(tokenObj, bonus) {
            const token = getObj('graphic', tokenObj.ID);
            const character = tokenObj.characterID !== undefined ?
                getObj('character', tokenObj.characterID) : undefined;
            if (token === undefined) {
                // Remove the TokenObj from the TokenList
                STATE.PaladinList.remove(tokenObj.ID);
            }
            else {
                log('= Setting bonus for ' + token.get('name') + ' =');
                // Show bonus on token
                if (bonus > 0) {
                    token.set(StatusMarker, bonus);
                }
                else {
                    token.set(StatusMarker, false);
                }
            }
            if (ModifyAttributes && character !== undefined) {
                // TODO set bonus in attributes for characters
                // TODO set bonus in attrs for NPCs
            }
        },
        /**
         * Tests if a token is in range of a paladin and gives them the aura bonus of the paladin with the highest bonus.
         * @param token A TokenObj that represents the token having its bonus calculated.
         */
        calcBonus(token) {
            const applicableBonuses = [];
            const palList = STATE.PaladinList.get();
            const paladinsToRemove = [];
            const character = token.characterID && getObj('character', token.characterID);
            palList.forEach(pID => {
                const paladin = STATE.get('TokenList', pID);
                let paladinProps;
                if (paladin !== undefined) {
                    paladinProps = paladin.paladinProps;
                }
                if (paladin === undefined || paladinProps === undefined) {
                    paladinsToRemove.push(token.ID);
                }
                else {
                    const dist = getDistance(token, paladin);
                    log(`dist: ${dist} | Paladin aura range: ${Paladin.auraRange(paladin)}`);
                    if (dist !== undefined && dist <= Paladin.auraRange(paladin)) {
                        const chaBonusAttr = getAttrFromID(paladinProps.chaBonusAttrID);
                        const chaBonus = chaBonusAttr !== undefined ? chaBonusAttr.get('current') : 1;
                        let forceInclusion;
                        if (character)
                            forceInclusion = Paladin.getInclusion(paladin, character.id);
                        else
                            forceInclusion = Paladin.getInclusion(paladin, token.ID);
                        if (forceInclusion === true ||
                            (!token.isNPC && forceInclusion !== false)) {
                            applicableBonuses.push(+chaBonus);
                        }
                    }
                }
            });
            STATE.PaladinList.modify({ remove: paladinsToRemove });
            return Math.max(...applicableBonuses, 0);
        },
        update(token) {
            if (token.get('_subtype') === 'token' && token.get('layer') === 'objects') {
                const tObj = Token.getOrAddTokenObj(token);
                Token.updatePos(token, tObj);
                Token.updateSize(token, tObj);
                if (tObj.paladinProps === undefined) {
                    Token.setBonus(tObj, Token.calcBonus(tObj));
                }
                else {
                    calcAllBonuses();
                }
            }
        },
        /**
         * Updates the stored position of a graphic if it's linked to a token. If the
         * token is a paladin then all tokens will have their bonuses re-calculated.
         * @param Graphic The updated token.
         */
        updatePos(token, tObj) {
            tObj.xPos = token.get('left');
            tObj.yPos = token.get('top');
        },
        updateSize(token, tObj) {
            tObj.xSize = token.get('width');
            tObj.ySize = token.get('height');
        },
        /**
         * Updates the TokenObj attributes for all TokenObjs related to this character.
         *
         * If a token has lost / gained the prerequisites for being a paladin, this will
         * also be updated.
         * @param char The character that had its attributes updated.
         */
        updateAttrs(char) {
            if (char === undefined) {
                log('Token.updateAttrs could not update the provided Character - The Character was undefined.');
            }
            else {
                const relatedTokenObjs = [];
                Object.keys(STATE.get('TokenList')).forEach(k => {
                    if (STATE.get('TokenList', k, 'characterID') === char.id)
                        relatedTokenObjs.push(k);
                });
                relatedTokenObjs.forEach(id => {
                    const tObj = STATE.get('TokenList', id);
                    if (tObj && (tObj.paladinProps !== undefined) !== charIsPaladin(char.id)) {
                        const token = getObj('graphic', id);
                        if (token === undefined) {
                            STATE.PaladinList.remove(id);
                            STATE.delete('TokenList', id);
                        }
                        else {
                            STATE.set(new TokenObj(token), 'TokenList', id);
                        }
                    }
                });
            }
        },
        /**
         * Returns `true` if the provided `tokenID` is in the `PaladinList`, else `false`.
         * @param tokenID The token ID to check against the `PaladinList`.
         */
        tokenIsPaladin(tokenID) {
            return STATE.PaladinList.get().indexOf(tokenID) !== -1;
        },
    };
    // ANCHOR Paladin object
    const Paladin = {
        // FIXME When attributes are missing, try updating attributes
        paladinAbilities() {
            return [
                ['~ToggleAuraTarget', '!pa toggle @{selected|token_id} @{target|token_id}'],
            ];
        },
        /**
         * Returns the radius of the paladin's aura in pixels, or -1.
         * @param paladin The paladin TokenObj.
         */
        auraRange(paladin) {
            const pageID = Campaign().get('playerpageid');
            const page = getObj('page', pageID);
            if (paladin.paladinProps === undefined || paladin.paladinProps.levelAttrID === undefined) {
                log('Couldn\'t get paladin level.');
                return -1;
            }
            else if (page === undefined) {
                log('Player page undefined.');
                return -1;
            }
            else {
                const hpAttr = getAttrFromID(paladin.paladinProps.hpAttrID);
                const hp = hpAttr !== undefined ? hpAttr.get('current') : 0;
                const grid_type = page.get('grid_type');
                const scale_units = page.get('scale_units');
                if (+hp > 0 && grid_type === 'square' && scale_units === 'ft') {
                    const pixPerSquare = page.get('snapping_increment') * 70;
                    const scale_number = page.get('scale_number');
                    const levelAttr = getAttrFromID(paladin.paladinProps.levelAttrID);
                    const level = levelAttr !== undefined ? levelAttr.get('current') : 0;
                    switch (true) {
                        case +level < 6:
                            return -1;
                        case +level < 18:
                            return 10 * pixPerSquare / scale_number;
                        default:
                            return 30 * pixPerSquare / scale_number;
                    }
                }
                else {
                    return -1;
                }
            }
        },
        /**
         * Toggles whether the target receives an aura bonus from the supplied paladin.
         * @param paladinID The supplied paladin ID.
         * @param targetID The target ID.
         */
        toggleAuraForTarget(paladinID, targetID) {
            if (Token.tokenIsPaladin(paladinID)) {
                const paladinObj = STATE.get('TokenList', paladinID);
                if (paladinObj.paladinProps === undefined) {
                    log('Could not toggle aura for target because supplied paladin has no paladin properties.');
                }
                else {
                    const target = getObj('graphic', targetID);
                    if (target === undefined || target.get('_subtype') !== 'token' || target.get('layer') !== 'objects') {
                        log('Could not grant bonus to target, the target is not a token (possibly a drawing or card).');
                    }
                    else {
                        const tIsNPC = tokenIsNPC(target);
                        const token = getObj('graphic', targetID);
                        const character = token && token.get('represents') && getObj('character', token.get('represents'));
                        const forceInclusion = Paladin.getInclusion(paladinObj, targetID);
                        let newVal;
                        if (forceInclusion !== undefined) {
                            newVal = forceInclusion === true ? 0 : 1;
                            if (character)
                                Paladin.toggleInclusion(paladinObj, character.id);
                            else
                                Paladin.toggleInclusion(paladinObj, targetID);
                        }
                        else {
                            if (tIsNPC) {
                                newVal = 1;
                            }
                            else {
                                newVal = 0;
                            }
                            if (character) {
                                Paladin.addInclusion(paladinObj, character.id, newVal);
                            }
                            else {
                                Paladin.addInclusion(paladinObj, targetID, newVal);
                            }
                        }
                    }
                }
            }
            else {
                log('The selected token is not registered as a paladin. Try restarting the API if this is an error.');
            }
        },
        /**
         * Gets the list of targets that this paladin has chosen to override
         * default behavior for from the paladin's attributes, and returns them
         * in a list.
         * @param paladinObj The supplied paladin objects.
         * @returns `[string, 0 | 1][]` or `undefined`.
         */
        getStoredInclusionList(paladinObj) {
            const paladinProps = paladinObj.paladinProps;
            if (paladinProps === undefined) {
                return undefined;
            }
            else {
                const attrID = paladinProps.forceIncludeAttrID || '';
                const attr = getObj('attribute', attrID);
                if (attr !== undefined) {
                    const attrString = attr.get('current');
                    const cases = [];
                    attrString.split(',').forEach(s => {
                        const parts = s.split('|');
                        cases.push([parts[0], +parts[1]]);
                    });
                    return cases;
                }
                return undefined;
            }
        },
        storeInclusionList(paladinObj) {
            const paladinProps = paladinObj.paladinProps;
            if (paladinProps !== undefined &&
                paladinProps.forceIncludeArr !== undefined) {
                if (paladinProps.forceIncludeAttrID === undefined) {
                    paladinProps.forceIncludeAttrID = createObj('attribute', {
                        _characterid: paladinProps.characterID,
                        name: 'PAForceInclude',
                    }).id;
                }
                const attr = getObj('attribute', paladinProps.forceIncludeAttrID);
                if (attr !== undefined) {
                    let newVal = '';
                    paladinProps.forceIncludeArr.forEach((a, b) => {
                        if (b > 0) {
                            newVal += ',';
                        }
                        newVal += `${a[0]}|${a[1]}`;
                    });
                    attr.setWithWorker('current', newVal);
                }
            }
        },
        getInclusionList(paladinObj) {
            const paladinProps = paladinObj.paladinProps;
            if (!(paladinProps === undefined ||
                paladinProps.forceIncludeArr === undefined)) {
                return paladinProps.forceIncludeArr;
            }
            else
                return [];
        },
        initFromStoredInclusionList(paladinObj) {
            if (paladinObj.paladinProps !== undefined) {
                paladinObj.paladinProps.forceIncludeArr = Paladin.getStoredInclusionList(paladinObj);
            }
        },
        getInclusion(paladinObj, targetID) {
            const inclusions = Paladin.getStoredInclusionList(paladinObj);
            const thisInclusion = inclusions !== undefined ?
                inclusions.find(a => { return a[0] === targetID; }) :
                undefined;
            let forceInclusion;
            if (thisInclusion !== undefined) {
                forceInclusion = thisInclusion[1] === 1;
            }
            return forceInclusion;
        },
        addInclusion(paladinObj, targetID, include) {
            if (paladinObj.paladinProps !== undefined) {
                if (paladinObj.paladinProps.forceIncludeArr !== undefined) {
                    paladinObj.paladinProps.forceIncludeArr.push([targetID, include]);
                }
                else {
                    paladinObj.paladinProps.forceIncludeArr = [[targetID, include]];
                }
                Paladin.storeInclusionList(paladinObj);
            }
        },
        toggleInclusion(paladinObj, targetID) {
            const list = Paladin.getInclusionList(paladinObj);
            const index = list.findIndex(a => { return a[0] === targetID; });
            list[index][1] = list[index][1] === 0 ? 1 : 0;
            if (paladinObj.paladinProps !== undefined) {
                paladinObj.paladinProps.forceIncludeArr = list;
                Paladin.storeInclusionList(paladinObj);
            }
            return list;
        },
    };
    // !SECTION
    // ANCHOR Start of program
    const startup = function () {
        // STARTUP CHECKLIST
        // - Check settings
        // - Register Events
        registerEventHandlers();
        // - Perform first run
        pageLoad();
    };
    // ANCHOR Event functions
    /**
     * Overload workaround that just calls `pageLoad()`.
     */
    function triggerPageLoad() {
        pageLoad();
    }
    /**
     * Uses `checkPage()` to see if the current player page is appropriate
     * for PaladinAura, then storing the result in
     * `state.PaladinAura.PageLoad`.
     *
     * If the page is appropriate, it replaces the current TokenList and
     * PaladinList state objects with newly filled instances.
     *
     * If `override` is supplied as `true` or `false` it will force the page
     * to load, or not to load, respectively.
     */
    function pageLoad(override) {
        const run = override || checkPage();
        STATE.set(run, 'PageLoad');
        if (run) {
            STATE.PaladinList.clear();
            const tokenList = {};
            const pageTokens = findObjs({
                _pageid: Campaign().get('playerpageid'),
                _type: 'graphic',
                _subtype: 'token',
                layer: 'objects',
            });
            pageTokens.forEach(t => {
                const tokenObj = new TokenObj(t);
                tokenList[t.id] = tokenObj;
            });
            STATE.set(tokenList, 'TokenList');
            log('= Finished loading page! =');
            calcAllBonuses();
            log('= Finished Calculating All Bonuses =');
        }
        else {
            clearTokenList();
            log('= Cleared All Bonuses =');
        }
    }
    /**
     * Runs whenever a page is modified. If the modified page is the one
     * the players are playing on, the page's new settings are checked.
     *
     * If the pages new settings change whether the page is appropriate,
     * `pageLoad()` is run.
     * @param p The page that has been modified.
     */
    function pageChange(p) {
        if (p.id === Campaign().get('playerpageid')) {
            const override = checkPage();
            if (override !== STATE.get('PageLoad'))
                pageLoad(override);
            else {
                setTimeout(() => {
                    calcAllBonuses();
                }, 1000);
            }
        }
    }
    // ANCHOR Misc
    const registerEventHandlers = function () {
        on('chat:message', handleInput);
        on('change:campaign:playerpageid', triggerPageLoad);
        on('change:page', pageChange);
        on('change:graphic', Token.update);
        on('add:graphic', Token.addToken);
        on('destroy:graphic', Token.removeToken);
        // on('change:attribute', Token.updateAttrs);
        log('<<< PaladinAura Ready >>>');
    };
    return {
        Startup: startup,
    };
})();
on('ready', () => {
    PaladinAura.Startup();
});
