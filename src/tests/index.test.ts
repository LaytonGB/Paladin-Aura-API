/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { MockObjectName } from './mocks/values';
import mockFunctions from './mocks/functions';

import { PaladinAura } from '..';

// @ts-ignore not assignable error because of roll20 types
global.Campaign = (): void => undefined;
const CampaignMock = jest.fn<Roll20Object | undefined, []>(mockFunctions.Campaign);
/* const createObjSpy =  */ jest
  .spyOn(global, 'Campaign')
  // @ts-ignore CreateObj overload causing bad-selection error
  .mockImplementation(CampaignMock);

// @ts-ignore not assignable error because of roll20 types
global.createObj = (): void => undefined;
const createObjMock = jest.fn<Roll20Object | undefined, [ObjectType, { [property: string]: any }]>(
  mockFunctions.createObj
);
/* const createObjSpy =  */ jest
  .spyOn(global, 'createObj')
  // @ts-ignore CreateObj overload causing bad-selection error
  .mockImplementation(createObjMock);

// @ts-ignore
global.getObj = (): void => undefined;
const getObjMock = jest.fn<Roll20Object | undefined, [ObjectType, string]>(mockFunctions.getObj);
/* const getObjSpy =  */ jest.spyOn(global, 'getObj').mockImplementation(getObjMock);

// @ts-ignore
global.findObjs = (): void => undefined;
const findObjsMock = jest.fn<Roll20Object[], [{ [property: string]: any }]>(mockFunctions.findObjs);
/* const findObjsSpy =  */ jest.spyOn(global, 'findObjs').mockImplementation(findObjsMock);

// @ts-ignore
global.filterObjs = (): void => undefined;
const filterObjsMock = jest.fn<Roll20Object[], [(obj: Roll20Object) => boolean]>(mockFunctions.filterObjs);
/* const filterObjsSpy =  */ jest.spyOn(global, 'filterObjs').mockImplementation(filterObjsMock);

const { on } = mockFunctions.getOnFunctions();
// @ts-ignore
global.on = (): void => undefined;
const onMock = jest.fn<void, [string, (obj: Roll20Object) => void]>(on);
// @ts-ignore On overload causing bad-selection error
/* const onSpy = */ jest.spyOn(global, 'on').mockImplementation(onMock);

global.log = (): void => undefined;
const logMock = jest.fn<void, [string]>(mockFunctions.log);
const logSpy = jest.spyOn(global, 'log').mockImplementation(logMock);
