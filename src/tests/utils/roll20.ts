export class MockRoll20Object implements Roll20Object {
  private _id: string;
  private props: { [property: string]: any };

  constructor(
    type: ObjectType,
    id: string,
    properties: { [property: string]: any } | undefined
  ) {
    this._id = id;
    this.props = { _id: id, _type: type, ...properties };
  }

  get id() {
    return this._id;
  }

  get(property: string): any {
    return this.props[property];
  }

  remove(): void {
    return;
  }

  set(property: string, value: any): void {
    if (property.startsWith('_')) {
      throw new Error('cannot set immutable properties');
    }

    const oldValue = this.props[property];
    if (oldValue !== undefined) {
      this.props[property] = value;
    }
  }
}
