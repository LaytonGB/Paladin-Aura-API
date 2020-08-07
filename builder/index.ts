/**
 * Paladin Aura API
 */
const PaladinAura = (() => {
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
            } else {
                this.isNPC = true;
            }
        }

        receiveBonus(paladin: PaladinObj) {
            // TODO return 0 or bonus that this token should be receiving
        }

        updatePos() {
            const token = getObj('graphic', this.tokenID);
            if (token !== undefined){
                this.xPos = token.get('left');
                this.yPos = token.get('top');
            } else {
                throw 'Can\'t update X and Y positions - TokenID is not linked to a token.'
                    + '\nToken ID: ' + this.tokenID;
            }
        }

        updateAttrs() {
            const token = getObj('graphic', this.tokenID);
            if (token !== undefined){
                // TODO update attributes
            } else {
                throw 'Can\'t update attrs - TokenID is not linked to a token.'
                    + '\nToken ID: ' + this.tokenID;
            }
        }
    }

    class PaladinObj extends TokenObj {
        characterID: string;
        levelAttrID: string;
        chaBonusAttrID: string;
        hpAttrID: string;
        forceIncludeAttrID: string;

        constructor(token: Graphic) {
            super(token);
            this.characterID = token.get('represents');
            this.levelAttrID = getAttrID('level', this.characterID);
            this.chaBonusAttrID = getAttrID('chaMod', this.characterID);
            this.hpAttrID = getAttrID('hp', this.characterID);
            this.forceIncludeAttrID = getAttrID('PAForceInclude', this.characterID);

            function getAttrID(name: string, characterID: string) {
                return findObjs({
                    _type: 'attribute',
                    _characterid: characterID,
                    name: name
                })[0].id;
            }
        }
    }

    // ANCHOR Start of program
    const startup = function () {
        /* STARTUP CHECKLIST
        - Check settings
        - Register Events
        - Perform first run */
        registerEventHandlers();
    };

    const registerEventHandlers = function () {
        // on('chat:message', handleInput);
        // on('change:campaign:playerpageid', initiate);
        // on('change:graphic', updatePosition);
        // on('add:graphic', addToken);
        // on('change:attribute', hpChange);
    };

    return {
        Startup: startup
    };
})();

on('ready', () => {
    PaladinAura.Startup();
});
