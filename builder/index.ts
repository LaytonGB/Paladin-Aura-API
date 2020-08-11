/**
 * Paladin Aura API
 */
// FIXME Correct error throws
const PaladinAura = (() => {
    // ANCHOR State object structure
    /*
        state.PaladinAura = {
            TokenList: { [id: string]: TokenObj },
            PaladinList: string[],
            PageLoad: boolean,
        }

        globalconfig.PaladinAura = {
            DiagonalMeasurementMethod: "auto" | "foure" | "threefive" | "pythagorean" | "manhattan"
        }
    */

    // ANCHOR Class definitions
    class TokenObj {
        tokenID: string;
        xPos: number;
        yPos: number;
        isNPC: boolean;
        characterID?: string;
        paladinObj?: PaladinObj;

        constructor(token: Graphic) {
            this.tokenID = token.id;
            this.xPos = token.get('left');
            this.yPos = token.get('top');
            const character = getObj('character', token.get('represents'));
            if (character !== undefined) {
                this.characterID = character.id;
                this.isNPC = getAttrByName(this.characterID, 'npc') === '1';
                if (this.isNPC === false) {
                    if (isPaladin(this.characterID)) {
                        this.paladinObj = new PaladinObj(token);
                        STATE.PaladinList.push(this.tokenID);
                    }
                }
            } else {
                this.isNPC = true;
            }
        }
    }

    class PaladinObj {
        characterID: string;
        levelAttrID?: string;
        chaBonusAttrID?: string;
        hpAttrID?: string;
        forceIncludeAttrID?: string;

        constructor(token: Graphic) {
            this.characterID = token.get('represents');
            this.levelAttrID = getAttrID('level', this.characterID);
            this.chaBonusAttrID = getAttrID('chaMod', this.characterID);
            this.hpAttrID = getAttrID('hp', this.characterID);
            this.forceIncludeAttrID = getAttrID('PAForceInclude', this.characterID);
        }
    }

    // ANCHOR Input handling
    function handleInput(msg: ChatEventData) {
        if (msg.type === 'api' && msg.content.split(' ')[0].toLowerCase() === '!pa') {
            if (msg.content.split(' ')[1].toLowerCase() === 'debug') {
                log('=== state.PaladinAura.TokenList ===');
                Object.keys(STATE.get('TokenList') as { [id: string]: TokenObj }).forEach((k: string) => {
                    const t: TokenObj = STATE.get('TokenList', k) as TokenObj;
                    const token = getObj('graphic', t.tokenID);
                    log('= TokenID: ' + t.tokenID + ' =');
                    if (token !== undefined) {
                        log('Name: ' + token.get('name'));
                    }
                    if (t.characterID !== undefined) {
                        log('isPaladin: ' + isPaladin(t.characterID));
                    } else {
                        log('Has no character sheet.');
                    }
                });
            }
        }
    }

    // ANCHOR Global functions
    function getAttrID(name: string, characterID: string): string | undefined {
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

    function getAttrFromID(id: string | undefined): string | undefined {
        if (id === undefined) {
            return undefined;
        } else {
            const attr = getObj('attribute', id);
            if (attr === undefined) {
                return undefined;
            } else {
                return attr.get('current');
            }
        }
    }

    function isPaladin(charID: string): boolean {
        const multiclasses: string[] = [];
        const classesToCheck: string[] = ['class'];
        ['multiclass1', 'multiclass2', 'multiclass3'].forEach(a => {
            multiclasses.push(getAttrByName(charID, a + '_flag'));
        });
        multiclasses.forEach(a => {
            if (a === '1') {
                classesToCheck.push(a);
            }
        });
        return classesToCheck.some(c => {
            const val = getAttrByName(charID, c);
            return val.search(/paladin/gi) !== -1;
        });
    }

    /**
     * Calculates and sets the Aura bonus for all tokens.
     */
    function calcAll() {
        Object.keys(STATE.get('TokenList') as { [id: string]: TokenObj }).forEach(k => {
            const tokenObj = STATE.get('TokenList', k) as TokenObj;
            Token.setBonus(tokenObj, Token.calcBonus(tokenObj));
        });
    }

    function clearAll() {
        Object.keys(STATE.get('TokenList') as { [id: string]: TokenObj }).forEach(k => {
            const tokenObj = STATE.get('TokenList', k) as TokenObj;
            Token.setBonus(tokenObj, 0);
        });
    }

    /**
     * Returns the distance between two points in pixels.
     * @param x1
     * @param y1
     * @param x2
     * @param y2
     */
    function getDistance(x1: number, y1: number, x2: number, y2: number): number | undefined {
        const pageID = Campaign().get('playerpageid');
        const page = getObj('page', pageID);
        if (page !== undefined) {
            const pixPerSquare = page.get('snapping_increment') * 70;
            const grid_type = page.get('grid_type');
            const scale_units = page.get('scale_units');
            if (grid_type === 'square' && scale_units === 'ft') {
                const xDif = Math.abs(x1 - x2);
                const yDif = Math.abs(y1 - y2);
                const dist1 = xDif > yDif ? xDif : yDif;
                const dist2 = xDif > yDif ? yDif : xDif;

                // const config = globalconfig.paladinaura; // FIXME Before release include globalconfig
                const config = { DiagonalMeasurementMethod: 'auto' };

                let measurementMethod: string;
                if (config.DiagonalMeasurementMethod === 'auto') {
                    if (page === undefined) {
                        throw 'Player page is undefined.';
                    } else {
                        measurementMethod = page.get('diagonaltype');
                    }
                } else {
                    measurementMethod = config.DiagonalMeasurementMethod;
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
                        return Math.round(Math.sqrt(((dist1^2) + (dist2^2)) / pixPerSquare)) * pixPerSquare;

                    case 'manhattan':
                        // Return the sum of distances
                        return dist1 + dist2;

                    default:
                        throw 'Measurement method invalid.';
                }
            }
        } else {
            return undefined;
        }
    }

    function checkPage() {
        const page = getObj('page', Campaign().get('playerpageid'));
        if (page === undefined) return false;
        let grid_type = '';
        let scale_units = '';
        if (page !== undefined) {
            grid_type = page.get('grid_type');
            scale_units = page.get('scale_units');
        }
        if (page !== undefined && grid_type === 'square' && scale_units === 'ft') {
            return true;
        } else {
            log('= Current page is not compatible with PaladinAura due to the following settings: =');
            if (page === undefined) log('page: undefined');
            if (grid_type !== 'square') log('grid_type: not "square"');
            if (scale_units !== 'ft') log('scale_units: not "ft"');
        }
        return false;
    }

    // ANCHOR Function objects
    const STATE = {
        get(
            val1: 'TokenList' | 'PaladinList' | 'PageLoad',
            val2?: string,
            val3?: string
        ): boolean | string | string[] | number | TokenObj | { [id: string]: TokenObj } | undefined {
            if (val2 === undefined && val3 === undefined) {
                return state.PaladinAura[val1];
            } else if (val2 !== undefined && val3 === undefined) {
                return state.PaladinAura[val1][val2];
            } else if (val2 !== undefined && val3 !== undefined) {
                return state.PaladinAura[val1][val2][val3];
            } else {
                return undefined;
            }
        },

        set(
            newVal: string | number | boolean | TokenObj | { [id: string]: TokenObj },
            val1: 'TokenList' | 'PaladinList' | 'PageLoad',
            val2?: string,
            val3?: string
        ): void {
            if (val2 === undefined && val3 === undefined) {
                state.PaladinAura[val1] = newVal;
            } else if (val2 !== undefined && val3 === undefined) {
                state.PaladinAura[val1][val2] = newVal;
            } else if (val2 !== undefined && val3 !== undefined) {
                state.PaladinAura[val1][val2][val3] = newVal;
            }
        },

        delete(
            val1: 'TokenList' | 'PaladinList' | 'PageLoad',
            val2?: string,
            val3?: string
        ): void {
            if (val2 === undefined && val3 === undefined) {
                delete state.PaladinAura[val1];
            } else if (val2 !== undefined && val3 === undefined) {
                delete state.PaladinAura[val1][val2];
            } else if (val2 !== undefined && val3 !== undefined) {
                delete state.PaladinAura[val1][val2][val3];
            }
        },

        PaladinList: {
            push(val: string): void {
                (state.PaladinAura.PaladinList as string[]).push(val);
            },

            remove(val: string): void {
                const palList = (state.PaladinAura.PaladinList as string[]);
                const index = palList.findIndex(pID => { return pID === val; });
                STATE.PaladinList.set(palList.splice(index, 1));
            },

            set(val: string[]): void {
                state.PaladinAura.PaladinList = val;
            },

            clear(): void {
                state.PaladinAura.PaladinList = [];
            },
        },
    };

    const Token = {
        addToken(token: Graphic): void {
            if (token.get('_subtype') === 'token') {
                STATE.set(new TokenObj(token), 'TokenList', token.id);
            }
        },

        removeToken(token: Graphic): void {
            const paladinListIndex: number = (STATE.get('PaladinList') as string[])
                .findIndex(a => { return a === token.id; });
            if (STATE.get('TokenList', token.id) !== undefined) {
                STATE.delete('TokenList', token.id);
                STATE.PaladinList.remove(token.id);
            }
            if (paladinListIndex !== -1) {
                calcAll();
            }
        },

        setBonus(tokenObj: TokenObj, bonus: number): void {
            const token = getObj('graphic', tokenObj.tokenID);
            const character = tokenObj.characterID !== undefined ?
                getObj('character', tokenObj.characterID) : undefined;
            if (token === undefined) {
                // TODO Remove token.
            } else {
                log('= Setting bonus for ' + token.get('name') + ' =');
                // Show bonus on token
                if (bonus > 0) {
                    token.set(statusMarker, bonus);
                } else {
                    token.set(statusMarker, false);
                }
            }
            if (character !== undefined) {
                // TODO set bonus in attributes for characters
                // TODO set bonus in attrs for NPCs
            }
        },

        calcBonus(token: TokenObj): number {
            log(`= Calculating bonus for '${token.tokenID}' =`);
            const applicableBonuses: number[] = [];
            (STATE.get('PaladinList') as string[]).forEach(pID => {
                const paladin = STATE.get('TokenList', pID) as TokenObj | undefined;
                let paladinProps: PaladinObj | undefined;
                if (paladin !== undefined) {
                    paladinProps = paladin.paladinObj;
                }
                if (paladin === undefined || paladinProps === undefined) {
                    // TODO Remove paladin ID from list
                } else {
                    log (`Paladin '${paladin.tokenID}' had the correct properties.`);
                    const dist = getDistance(
                        token.xPos,
                        token.yPos,
                        STATE.get('TokenList', pID, 'xPos') as number,
                        STATE.get('TokenList', pID, 'yPos') as number
                    );
                    log(`Paladin '${paladin.tokenID}' is ${dist} from this token.`);
                    if (dist !== undefined && dist <= Paladin.auraRange(paladin)) {
                        log('Paladin was close enough.');
                        const chaBonus = getAttrFromID(paladinProps.chaBonusAttrID) || 1;
                        log('Added bonus to bonuses list.');
                        applicableBonuses.push(+chaBonus);
                    }
                }
            });
            log('All applicable bonuses: ' + applicableBonuses.toString());
            return Math.max(...applicableBonuses, 0);
        },

        updatePos(token: Graphic): void {
            const tObj = STATE.get('TokenList', token.id) as TokenObj | undefined;
            if (token === undefined || tObj === undefined) {
                log('Can\'t update X and Y positions - TokenID is not linked to a token.'
                    + '\nToken ID: ' + token.id);
            } else {
                log('<< Moving Token \'' + token.get('name') + '\' >>');
                log(`Old Position: ${tObj.xPos}, ${tObj.yPos}`);
                log(`New Position: ${token.get('left')}, ${token.get('top')}`);
                tObj.xPos = token.get('left');
                tObj.yPos = token.get('top');
                log('= Calculating Bonuses =');
                if (tObj.paladinObj === undefined) {
                    log(`Calculating bonus for token '${token.get('name')}'.`);
                    this.setBonus(tObj, this.calcBonus(tObj));
                } else {
                    log('Calculating bonus for all tokens.');
                    calcAll();
                }
            }
        },

        updateAttrs(token: TokenObj): void {
            if (token === undefined) {
                throw 'Can\'t update attrs - The TokenObj provided is undefined.';
            } else {
                // TODO update attributes
            }
        },
    };

    const Paladin = {
        /**
         * Returns the radius of the paladin's aura in pixels, or -1.
         * @param token The paladin TokenObj.
         */
        auraRange(token: TokenObj): number {
            const pageID = Campaign().get('playerpageid');
            const page = getObj('page', pageID);
            if (token.paladinObj === undefined || token.paladinObj.levelAttrID === undefined) {
                log('Couldn\'t get paladin level.');
                return -1;
            } else if (page === undefined) {
                log('Player page undefined.');
                return -1;
            } else {
                const hp = getAttrFromID(token.paladinObj.hpAttrID) || 0;
                const grid_type = page.get('grid_type');
                const pixPerSquare = page.get('snapping_increment') * 70;
                const scale_units = page.get('scale_units');
                const scale_number = page.get('scale_number');
                if (+hp > 0 && grid_type === 'square' && scale_units === 'ft') {
                    const level = getAttrFromID(token.paladinObj.levelAttrID) || 0;
                    switch (true) {
                        case +level < 6:
                            return -1;

                        case +level < 18:
                            return 10 * pixPerSquare / scale_number;

                        default:
                            return 30 * pixPerSquare / scale_number;
                    }
                } else {
                    return -1;
                }
            }
        },
    };

    // ANCHOR Global variables
    const statusMarker = 'status_bolt-shield';

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
    function triggerPageLoad(): void {
        pageLoad();
    }

    /**
     * Uses `checkPage()` to see if the current player page is appropriate
     * for PaladinAura, then storing the result in
     * `state.PaladinAura.PageLoad`.
     *
     * If the page is appropriate, it replaces the current TokenList and
     * PaladinList state objects with newly filled instances.
     */
    function pageLoad(override?: boolean): void {
        const run = override || checkPage();
        STATE.set(run, 'PageLoad');
        if (run) {
            STATE.PaladinList.clear();
            const tokenList: { [id: string]: TokenObj } = {};
            const pageTokens = findObjs({
                _pageid: Campaign().get('playerpageid'),
                _type: 'graphic',
                _subtype: 'token',
                layer: 'objects',
            }) as Graphic[];
            pageTokens.forEach(t => {
                tokenList[t.id] = new TokenObj(t);
            });
            STATE.set(tokenList, 'TokenList');
            log('= Finished loading page! =');
            calcAll();
            log('= Finished Calculating All Bonuses =');
        } else {
            clearAll();
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
    function pageChange(p: Page) {
        if (p.id === Campaign().get('playerpageid')) {
            const override = checkPage();
            if (override !== STATE.get('PageLoad') as boolean) pageLoad(override);
            else {
                setTimeout(() => {
                    calcAll();
                }, 1000);
            }
        }
    }

    // ANCHOR Misc
    const registerEventHandlers = function () {
        on('chat:message', handleInput);
        on('change:campaign:playerpageid', triggerPageLoad);
        on('change:page', pageChange);
        on('change:graphic', Token.updatePos);
        on('add:graphic', Token.addToken);
        on('destroy:graphic', Token.removeToken);
        // on('change:attribute', hpChange);
        log('<<< PaladinAura Ready >>>');
    };

    return {
        Startup: startup,
    };
})();

on('ready', () => {
    PaladinAura.Startup();
});
