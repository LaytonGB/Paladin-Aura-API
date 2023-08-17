/**
 * PaladinAura Roll20 API
 *
 * Created by Layton Burchell
 * https://app.roll20.net/users/1519557/layton
 * https://gitlab.com/LaytonGB/Paladin-Aura-API
 */
/*
TODO compiling gives typescript unknown variable errors
 */
const PaladinAura = (() => {
    const locs = Locs.new(); // TODO filterObjs can break - if a referenced variable changes nothing updates the cache!
    const objectIsAttribute = (obj) => {
        return obj.get('_type') !== 'attribute';
    };
    const tests = {
        printAllPaladins: () => {
            const paladinContainingClassAttributes = locs.filterObjs((obj) => {
                if (objectIsAttribute(obj)) {
                    return false;
                }
                const name = obj.get('name');
                if (!['class', 'multiclass1', 'multiclass2', 'multiclass3'].includes(name)) {
                    return false;
                }
                return obj.get('current') === 'paladin';
            });
            const paladinCharacters = paladinContainingClassAttributes
                .map((attr) => {
                return getObj('character', attr.get('_characterid'));
            })
                .filter((char) => char);
            return paladinCharacters;
        },
    };
    return {
        tests,
    };
})();
