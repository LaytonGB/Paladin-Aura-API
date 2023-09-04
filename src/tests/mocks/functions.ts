/* eslint-disable @typescript-eslint/no-unused-vars */

import mockValues from './values';

function Campaign(): Roll20Object {
  const campaign = mockValues.mockRequestResults.get('mock_campaign');
  if (!campaign) throw new Error('campaign object not found');

  return campaign;
}

function createObj(type: ObjectType, properties: { [property: string]: string }): Roll20Object {
  const createdObj = mockValues.mockRequestResults.get(`created_${type}`);
  if (createdObj === undefined) throw new Error('created object does not exist in mocked values');

  return createdObj;
}

function filterObjs(callback: (obj: Roll20Object) => boolean): Roll20Object[] {
  const filteredObjects: Roll20Object[] = [];
  const allObjects = mockValues.mockRequestResults.values();
  for (const currentObject of allObjects) if (callback(currentObject)) filteredObjects.push(currentObject);

  return filteredObjects;
}

function findObjs<T extends ObjectType>(
  properties: Partial<ObjectPropertyMap[T]>,
  options?: FindObjectOptions
): ObjectTypeMap[T][];
function findObjs(properties: { [property: string]: any }, options?: FindObjectOptions): Roll20Object[];
function findObjs(properties: { [property: string]: any }, options?: FindObjectOptions): Roll20Object[] {
  const filteredObjects: Roll20Object[] = [];
  const allObjects = mockValues.mockRequestResults.values();
  const checkFunc = options?.caseInsensitive
    ? (a: any, b: any): boolean => (typeof a === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b)
    : (a: any, b: any): boolean => a === b;
  outer: for (const currentObject of allObjects) {
    for (const [property, searchValue] of Object.entries(properties)) {
      const currentValue = currentObject.get(property);
      if (!checkFunc(currentValue, searchValue)) continue outer;
    }
    filteredObjects.push(currentObject);
  }
  return filteredObjects;
}

function getAttrByName(
  character_id: string,
  attribute_name: string,
  value_type: 'current' | 'max' = 'current'
): string {
  const allResults = findObjs<'attribute'>({
    _type: 'attribute',
    _characterid: character_id,
    name: attribute_name,
  });
  if (allResults.length > 1) throw new Error('more than 1 attribute with same name exists for character');
  else if (allResults.length === 0) throw new Error('no such attribute exists for character');

  const attribute = allResults[0];
  return attribute.get(value_type);
}

function getObj(type: ObjectType, id: string): Roll20Object | undefined {
  const mockIds = mockValues.mockRequestArgs.ids;
  if (!mockIds.includes(id)) throw new Error('invalid mock id');

  const mockResult = mockValues.mockRequestResults.get(id);
  if (!mockResult) throw new Error('valid mock id returned invalid mock result');

  return mockResult;
}

interface TriggerEvent {
  (eventType: 'add' | 'destroy', objectType: ObjectType, obj: Roll20Object): void;
  <T extends ObjectType>(eventType: 'change', objectType: T, obj: ObjectTypeMap[T], oldObj: ObjectPropertyMap[T]): void;
}

function getTriggerEventWithBoundEvents(
  events: Map<string, ((...objs: (Roll20Object | object)[]) => void)[]>
): TriggerEvent {
  function triggerEvent(eventType: 'add' | 'destroy', objectType: ObjectType, obj: Roll20Object): void;
  function triggerEvent<T extends ObjectType>(
    eventType: 'change',
    objectType: T,
    obj: ObjectTypeMap[T],
    oldObj: ObjectPropertyMap[T]
  ): void;
  function triggerEvent(eventType: EventType, objectType: ObjectType, ...objs: (Roll20Object | object)[]): void {
    const eventLabel: Roll20EventLabel = `${eventType}:${objectType}`;
    events.get(eventLabel)?.forEach((callback) => callback(...objs));
  }

  return triggerEvent;
}

interface On {
  (eventLabel: Roll20EventLabel, callback: (obj: Roll20Object) => void): void;
  (eventLabel: Roll20EventLabel, callback: (obj: Roll20Object, oldObj: Roll20Object) => void): void;
}

function getOnWithBoundEvents(events: Map<string, ((...objs: Roll20Object[]) => void)[]>): On {
  function on(eventLabel: Roll20EventLabel, callback: (obj: Roll20Object) => void): void;
  function on(eventLabel: Roll20EventLabel, callback: (obj: Roll20Object, oldObj: Roll20Object) => void): void;
  function on(eventLabel: Roll20EventLabel, callback: (...objs: Roll20Object[]) => void): void {
    let callbackArray = events.get(eventLabel);
    if (!callbackArray) {
      callbackArray = [];
      events.set(eventLabel, callbackArray);
    }

    callbackArray.push(callback);
  }

  return on;
}

interface GetOnFunctions {
  triggerEvent: TriggerEvent;
  on: On;
}

function getOnFunctions(): GetOnFunctions {
  const events = new Map<Roll20EventLabel, ((...objs: (Roll20Object | object)[]) => void)[]>();

  return {
    triggerEvent: getTriggerEventWithBoundEvents(events),
    on: getOnWithBoundEvents(events),
  };
}

function log(message: string): void {
  console.log(message);
}

export default {
  Campaign,
  createObj,
  filterObjs,
  findObjs,
  getAttrByName,
  getObj,
  getOnFunctions,
  log,
};
