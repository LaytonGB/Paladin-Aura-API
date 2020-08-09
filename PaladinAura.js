"use strict";
/**
 * Paladin Aura API
 */
const PaladinAura = (() => {
    // ANCHOR Class definitions
    class TokenObj {
        constructor(token) {
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
            }
            else {
                this.isNPC = true;
            }
        }
        receiveBonus(token) {
            // TODO return 0 or bonus that this token should be receiving
            const applicableBonuses = [];
            PaladinIDList.forEach(pID => {
                const paladinProps = TokenList[pID].paladinObj;
                if (paladinProps === undefined) {
                    throw 'Paladin ID did not call a paladin.';
                }
                else {
                    const dist = getDistance(token.xPos, token.yPos, TokenList[pID].xPos, TokenList[pID].yPos);
                    if (dist <= paladinProps.auraRange()) {
                        const attr = getObj('attribute', paladinProps.levelAttrID);
                        if (attr === undefined) {
                            throw 'Level attribute could not be found.';
                        }
                        else {
                            applicableBonuses.push(+attr.get('current'));
                        }
                    }
                }
            });
            return Math.max(...applicableBonuses, 0);
        }
        updatePos() {
            const token = getObj('graphic', this.tokenID);
            if (token !== undefined) {
                this.xPos = token.get('left');
                this.yPos = token.get('top');
            }
            else {
                throw 'Can\'t update X and Y positions - TokenID is not linked to a token.'
                    + '\nToken ID: ' + this.tokenID;
            }
        }
        updateAttrs() {
            const token = getObj('graphic', this.tokenID);
            if (token !== undefined) {
                // TODO update attributes
            }
            else {
                throw 'Can\'t update attrs - TokenID is not linked to a token.'
                    + '\nToken ID: ' + this.tokenID;
            }
        }
    }
    class PaladinObj {
        constructor(token) {
            this.characterID = token.get('represents');
            this.levelAttrID = getAttrID('level', this.characterID);
            this.chaBonusAttrID = getAttrID('chaMod', this.characterID);
            this.hpAttrID = getAttrID('hp', this.characterID);
            this.forceIncludeAttrID = getAttrID('PAForceInclude', this.characterID);
        }
        auraRange() {
            const attr = getObj('attribute', this.levelAttrID);
            if (attr === undefined) {
                throw 'Level attribute is undefined';
            }
            else {
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
        }
    }
    /**
     * Returns a TokenObj that has PaladinObj properties if the token represented
     * a paladin.
     * @param t A token with only base properties.
     */
    function getTokenOrPaladin(t) {
        const token = getObj('graphic', t._id);
        if (token !== undefined) {
            const newTokenObj = new TokenObj(token);
            if (newTokenObj.paladinObj !== undefined) {
                PaladinIDList.push(newTokenObj.paladinObj.characterID);
            }
            return newTokenObj;
        }
        else {
            throw 'Input for TokenObj creation was not a Graphic:'
                + '\nInput Type: ' + t._type
                + '\nInput ID: ' + t._id;
        }
    }
    // ANCHOR Global functions
    function getAttrID(name, characterID) {
        return findObjs({
            _type: 'attribute',
            _characterid: characterID,
            name: name
        })[0].id;
    }
    function isPaladin(charID) {
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
        classesToCheck.forEach(c => {
            if (c.search(/paladin/gi)) {
                return true;
            }
        });
        return false;
    }
    function getDistance(x1, y1, x2, y2) {
        // TODO Sort rounding and page measurement settings.
        const xDif = Math.abs(x1 - x2);
        const yDif = Math.abs(y1 - y2);
        const dist1 = xDif > yDif ? xDif : yDif;
        const dist2 = xDif > yDif ? yDif : xDif;
        // FIXME Add an entry for globalconfig to the types file
        const config = globalconfig.paladinaura;
        const pageID = Campaign().get('playerpageid');
        const page = getObj('page', pageID);
        let measurementMethod;
        if (config.DiagonalMeasurementMethod === 'auto') {
            if (page === undefined) {
                throw 'Player page is undefined.';
            }
            else {
                measurementMethod = page.get('diagonaltype');
            }
        }
        else {
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
                return Math.sqrt((dist1 ^ 2) + (dist2 ^ 2));
            case 'manhattan':
                // Return the sum of distances
                return dist1 + dist2;
            default:
                throw 'Measurement method invalid.';
        }
    }
    // ANCHOR Global variables
    const PaladinIDList = [];
    const TokenList = {};
    // ANCHOR Start of program
    const startup = function () {
        // STARTUP CHECKLIST
        // - Check settings
        // - Register Events
        registerEventHandlers();
        // - Perform first run
    };
    const registerEventHandlers = function () {
        // on('chat:message', handleInput);
        // on('change:campaign:playerpageid', initiate);
        // on('change:graphic', updatePosition);
        // on('add:graphic', addToken);
        // on('change:attribute', hpChange);
        log('PaladinAura Ready');
    };
    return {
        Startup: startup
    };
})();
on('ready', () => {
    PaladinAura.Startup();
});
