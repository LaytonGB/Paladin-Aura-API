const PaladinAura = (() => {
    const startup = function() {
        /* STARTUP CHECKLIST
        - Check settings
        - Register Events
        - Perform first run */
        registerEventHandlers();
    };

    const registerEventHandlers = function() {
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
