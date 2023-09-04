/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */

import _ from 'lodash';

import { MockObjectName } from './mocks/values';
import mockValues from './mocks/values';
import mockFunctions from './mocks/functions';

import { MockRoll20Object } from './utils/roll20';

// @ts-ignore not assignable error because of roll20 types
global.createObj = (): void => undefined;
const createObjSpy = jest
  .spyOn(global, 'createObj')
  // @ts-ignore CreateObj overload causing bad-selection error
  .mockImplementation(mockFunctions.createObj);

// @ts-ignore
global.getObj = (): void => undefined;
const getObjSpy = jest.spyOn(global, 'getObj').mockImplementation(mockFunctions.getObj);

// @ts-ignore
global.findObjs = (): void => undefined;
const findObjsSpy = jest
  .spyOn(global, 'findObjs')
  // @ts-ignore FindObj overload causing bad-selection error
  .mockImplementation(mockFunctions.findObjs);

// @ts-ignore
global.filterObjs = (): void => undefined;
const filterObjsSpy = jest.spyOn(global, 'filterObjs').mockImplementation(mockFunctions.filterObjs);

const { triggerEvent, on } = mockFunctions.getOnFunctions();
// @ts-ignore
global.on = (): void => undefined;
// @ts-ignore On overload causing bad-selection error
const onSpy = jest.spyOn(global, 'on').mockImplementation(on);

global.log = (): void => undefined;
const logSpy = jest.spyOn(global, 'log').mockImplementation(mockFunctions.log);

describe('encapsulated functions', () => {
  it.todo('event handlers correctly register');
  it.todo('correctly identifies active pages');
  it.todo('correctly assesses if a token is on an active page');
  it.todo('correctly creates paladin ability macros');
  it.todo('correctly unlists inactive pages');
  it.todo('correctly applies aura on all active pages');
});

describe('startup processes', () => {
  it.todo('all players around a paladin of 6th+ level get their bonus');
  it.todo('no npcs around a paladin of 6th+ level get a bonus');
  it.todo('no aura bonus is given by a paladin at 0 hit points');
  it.todo('ability macros are created for all paladins');
});

describe('chat commands', () => {
  describe('toggle aura for target', () => {
    // TODO create characters for the below graphics

    const paladinGraphicLowBonusProps: ObjectCreationPropertiesMap['graphic'] & Partial<ObjectPropertyMap['graphic']> =
      {
        _type: 'graphic',
        _id: 'LOW_BONUS_PALADIN_GRAPHIC',
        _pageid: MockObjectName.MOCK_PAGE_CURRENT,
        represents: 'LOW_BONUS_PALADIN_CHARACTER',
      };
    const paladinGraphicHighBonusProps: ObjectCreationPropertiesMap['graphic'] & Partial<ObjectPropertyMap['graphic']> =
      {
        _type: 'graphic',
        _id: 'HIGH_BONUS_PALADIN_GRAPHIC',
        _pageid: MockObjectName.MOCK_PAGE_CURRENT,
        represents: 'HIGH_BONUS_PALADIN_CHARACTER',
      };
    const nonPaladinPcGraphicProps: ObjectCreationPropertiesMap['graphic'] & Partial<ObjectPropertyMap['graphic']> = {
      _type: 'graphic',
      _id: 'PC_GRAPHIC',
      _pageid: MockObjectName.MOCK_PAGE_CURRENT,
      represents: 'PC_CHARACTER',
    };
    const npcGraphicProps: ObjectCreationPropertiesMap['graphic'] & Partial<ObjectPropertyMap['graphic']> = {
      _type: 'graphic',
      _id: 'NPC_GRAPHIC',
      _pageid: MockObjectName.MOCK_PAGE_CURRENT,
      represents: 'NPC_CHARACTER',
    };
    const sheetlessGraphicProps: ObjectCreationPropertiesMap['graphic'] & Partial<ObjectPropertyMap['graphic']> = {
      _type: 'graphic',
      _id: 'SHEETLESS_GRAPHIC',
      _pageid: MockObjectName.MOCK_PAGE_CURRENT,
    };

    let paladinGraphicLowBonus;
    let paladinGraphicHighBonus;
    let nonPaladinPcGraphic;
    let NpcGraphic;
    let sheetlessGraphic;

    beforeEach(() => {
      // TODO create objects and assign to variables
    });

    it.todo('does not work when selected token is not paladin');
    it.todo('toggles aura off for paladin targeting pc');
    it.todo('toggles aura on for paladin targeting npc');
    it.todo('toggles aura on for paladin targeting sheetless graphic');
    it.todo('inverts aura rule for targets that were already toggled');
  });
});

describe('event processes', () => {
  it.todo('player specific page changes trigger token info caching');
});
