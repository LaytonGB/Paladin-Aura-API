export class MockRoll20Object<T extends ObjectType> implements Roll20Object {
  private props: { [property: string]: any };

  constructor(type: T, id: string, properties: Partial<ObjectPropertyMap[T]> | undefined) {
    this.props = { _id: id, _type: type, ...properties };
  }

  get id(): Roll20Id {
    return this.get('_id');
  }

  get _id(): Roll20Id {
    return this.get('_id');
  }

  get _type(): T {
    return this.get('_type');
  }

  get(property: string): any {
    return this.props[property];
  }

  remove(): void {
    return;
  }

  set(property: string, value: any): void {
    if (property.startsWith('_')) throw new Error('cannot set immutable properties');

    const oldValue = this.props[property];
    if (oldValue !== undefined) this.props[property] = value;
  }
}
