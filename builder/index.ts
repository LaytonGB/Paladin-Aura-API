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
        chaBonusAttrID?: string; // TODO sort these errors
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

    // TODO Input handling
    function handleInput(msg: ChatEventData) {
        if (msg.type === 'api' && msg.content.split(' ')[0].toLowerCase() === '!pa') {
            if (msg.content.split(' ')[1].toLowerCase() === 'debug') {
                log('=== state.PaladinAura.TokenList ===');
                Object.keys(state.PaladinAura.TokenList).forEach((k: string) => {
                    const t = state.PaladinAura.TokenList[k];
                    log('= TokenID: ' + t.tokenID + ' =');
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
        const xDif = Math.abs(x1 - x2);
        const yDif = Math.abs(y1 - y2);
        const dist1 = xDif > yDif ? xDif : yDif;
        const dist2 = xDif > yDif ? yDif : xDif;
        const config = globalconfig.paladinaura;
        const pageID = Campaign().get('playerpageid');
        const page = getObj('page', pageID);
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

    // ANCHOR Function objects
    const tokenFunc = {
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

        updatePos(token: TokenObj) {
            const t = getObj('graphic', token.tokenID);
            if (t !== undefined) {
                token.xPos = t.get('left');
                token.yPos = t.get('top');
            } else {
                throw 'Can\'t update X and Y positions - TokenID is not linked to a token.'
                    + '\nToken ID: ' + token.tokenID;
            }
        },

        updateAttrs(token: TokenObj) {
            if (token === undefined) {
                throw 'Can\'t update attrs - The TokenObj provided is undefined.';
            } else {
                // TODO update attributes
            }
        },
    };

    const paladinFunc = {
        auraRange(token: TokenObj): number {
            if (token.paladinObj === undefined) {
                throw 'Cannot get paladin aura, TokenObj does not have paladin properties.'
                    + '\nToken ID: ' + token.tokenID;
            }
            if (token.paladinObj.levelAttrID === undefined) {
                throw 'Bro, no!';
            }
            const attr = getObj('attribute', token.paladinObj.levelAttrID);
            if (attr === undefined) {
                throw 'Level attribute is undefined';
            } else {
                const level = +attr.get('current');
                switch (true) {
                    case level < 6:
                        return -1;

                    case level < 18:
                        return 10; // TODO Sort measurements

                    default:
                        return 30;
                }
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
     * Replaces the current TokenList state object with a newly filled
     * instance.
     */
    function pageLoad(): void {
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

    // ANCHOR Misc
    const registerEventHandlers = function () {
        on('chat:message', handleInput);
        on('change:campaign:playerpageid', pageLoad);
        // on('change:graphic', updatePosition);
        // on('add:graphic', addToken);
        // on('change:attribute', hpChange);
        log('PaladinAura Ready');
    };

    return {
        Startup: startup,
    };
})();

on('ready', () => {
    PaladinAura.Startup();
});
