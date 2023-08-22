/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */
const PaladinAura = (() => {
    const locs = Locs.new();
    const messageIsApiMessage = (message) => {
        return message.type === 'api';
    };
    const chatObserver = (message) => {
        if (!messageIsApiMessage(message)) {
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
