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
            PageActive: boolean,
        }
    */

    // ANCHOR Pre-create state properties
    state.PaladinAura = {
        TokenList: {},
        PaladinList: [],
    };

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
                Object.keys(state.PaladinAura.TokenList).forEach((k: string) => {
                    const t: TokenObj = state.PaladinAura.TokenList[k];
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

    function getDistance(x1: number, y1: number, x2: number, y2: number): number {
        // TODO Sort rounding and page measurement settings.
        const pageID = Campaign().get('playerpageid');
        const page = getObj('page', pageID);
        let snap = -1;
        let grid_type = '';
        let scale_units = '';
        if (page !== undefined) {
            snap = page.get('snapping_increment');
            grid_type = page.get('grid_type');
            scale_units = page.get('scale_units');
        }

        const xDif = Math.abs(x1 - x2);
        const yDif = Math.abs(y1 - y2);
        const dist1 = xDif > yDif ? xDif : yDif;
        const dist2 = xDif > yDif ? yDif : xDif;

        const config = globalconfig.paladinaura;
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
                // Return larger distance + 1/2 smaller distance, rounded to grid
                return dist1 + (0.5 * dist2);

            case 'pythagorean':
                // Return exact distance
                return Math.sqrt((dist1^2) + (dist2^2));

            case 'manhattan':
                // Return the sum of distances
                return dist1 + dist2;

            default:
                throw 'Measurement method invalid.';
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
    const Token = {
        receiveBonus(token: TokenObj): number {
            const applicableBonuses: number[] = [];
            PaladinIDList.forEach(pID => {
                const paladinProps = state.PaladinAura.TokenList[pID].paladinObj;
                if (paladinProps === undefined) {
                    throw 'Paladin ID did not call a paladin.';
                } else {
                    const dist = getDistance(
                        token.xPos,
                        token.yPos,
                        state.PaladinAura.TokenList[pID].xPos,
                        state.PaladinAura.TokenList[pID].yPos
                    );
                    if (dist <= paladinProps.auraRange()) {
                        const attr = getObj('attribute', paladinProps.levelAttrID);
                        if (attr === undefined) {
                            throw 'Level attribute could not be found.';
                        } else {
                            applicableBonuses.push(+attr.get('current'));
                        }
                    }
                }
            });
            return Math.max(...applicableBonuses, 0);
        },

        updatePos(token: Graphic): void {
            const tObj: TokenObj | undefined = state.PaladinAura.TokenList[token.id];
            if (token === undefined || tObj === undefined) {
                log('Can\'t update X and Y positions - TokenID is not linked to a token.'
                    + '\nToken ID: ' + token.id);
            } else {
                log('<< Moving Token \'' + token.get('name') + '\' >>');
                log(`Old Position: ${tObj.xPos}, ${tObj.yPos}`);
                log(`New Position: ${token.get('left')}, ${token.get('top')}`);
                tObj.xPos = token.get('left');
                tObj.yPos = token.get('top');
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
        auraRange(token: TokenObj): number {
            if (token.paladinObj === undefined) {
                throw 'Cannot get paladin aura, TokenObj does not have paladin properties.'
                    + '\nToken ID: ' + token.tokenID;
            }
            if (token.paladinObj.levelAttrID === undefined) {
                throw 'Bro, no!';
            }
            const val = getAttrFromID(token.paladinObj.levelAttrID);
            const level = val || 0;
            switch (true) {
                case +level < 6:
                    return -1;

                case +level < 18:
                    return 10; // TODO Sort measurements

                default:
                    return 30;
            }
        },
    };

    // ANCHOR Global variables
    const PaladinIDList: string[] = [];

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
     * `state.PaladinAura.PageActive`.
     *
     * If the page is appropriate, it replaces the current TokenList and
     * PaladinList state objects with newly filled instances.
     */
    function pageLoad(override?: boolean): void {
        const run = override || checkPage();
        state.PaladinAura.PageLoad = run;
        if (run) {
            const tokenList: { [id: string]: TokenObj } = {};
            const pageTokens = findObjs({
                _pageid: Campaign().get('playerpageid'),
                _type: 'graphic',
                _subtype: 'token',
            }) as Graphic[];
            pageTokens.forEach(t => {
                tokenList[t.id] = new TokenObj(t);
            });
            state.PaladinAura.TokenList = tokenList;
            log('= Finished loading page! =');
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
            if (override !== state.PaladinAura.PageLoad) pageLoad(override);
        }
    }

    // ANCHOR Misc
    const registerEventHandlers = function () {
        on('chat:message', handleInput);
        on('change:campaign:playerpageid', triggerPageLoad);
        on('change:page', pageChange);
        on('change:graphic', Token.updatePos);
        // on('add:graphic', addToken);
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
