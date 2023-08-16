import { MockRoll20Object } from '../utils/roll20';

const mockObjectConstants = {
  mockGraphicTop: 30,
  mockGraphicLeft: 100,
  mockAttributeHpName: 'hp',
  mockAttributeHpCurrent: 10,
  mockAttributeHpMax: 20,
};

export enum MockObjectName {
  CREATED_CHARACTER = 'created_character',
  CREATED_GRAPHIC = 'created_graphic',
  MOCK_ATTRIBUTE = 'mock_attribute',
  MOCK_CAMPAIGN = 'mock_campaign',
  MOCK_CHARACTER = 'mock_character',
  MOCK_GRAPHIC = 'mock_graphic',
  MOCK_GRAPHIC_ON_PLAYER_PAGE = 'mock_graphic_on_player_page',
  MOCK_GRAPHIC_ON_VISITED_PAGE = 'mock_graphic_on_visited_page',
  MOCK_PAGE_CURRENT = 'mock_page_current',
  MOCK_PAGE_INACTIVE = 'mock_page_inactive',
  MOCK_PAGE_VISITED = 'mock_page_visited',
  MOCK_PLAYER = 'mock_player',
}

const mockObjectParams: {
  type: ObjectType;
  id: string;
  properties?: { [property: string]: any };
}[] = [
  {
    type: 'attribute',
    id: MockObjectName.MOCK_ATTRIBUTE,
    properties: {
      _characterid: MockObjectName.MOCK_CHARACTER,
      name: mockObjectConstants.mockAttributeHpName,
      current: mockObjectConstants.mockAttributeHpCurrent,
      max: mockObjectConstants.mockAttributeHpMax,
    },
  },
  {
    type: 'campaign',
    id: MockObjectName.MOCK_CAMPAIGN,
    properties: {
      playerpageid: MockObjectName.MOCK_PAGE_CURRENT,
      playerspecificpages: [MockObjectName.MOCK_PAGE_VISITED],
    },
  },
  { type: 'character', id: MockObjectName.CREATED_CHARACTER },
  { type: 'character', id: MockObjectName.MOCK_CHARACTER },
  {
    type: 'graphic',
    id: MockObjectName.CREATED_GRAPHIC,
    properties: {
      top: mockObjectConstants.mockGraphicTop,
      left: mockObjectConstants.mockGraphicLeft,
    },
  },
  {
    type: 'graphic',
    id: MockObjectName.MOCK_GRAPHIC,
    properties: {
      top: mockObjectConstants.mockGraphicTop,
      left: mockObjectConstants.mockGraphicLeft,
    },
  },
  {
    type: 'graphic',
    id: MockObjectName.MOCK_GRAPHIC_ON_PLAYER_PAGE,
    properties: {
      top: 700,
      left: 700,
      _pageid: MockObjectName.MOCK_PAGE_CURRENT,
    },
  },
  {
    type: 'graphic',
    id: MockObjectName.MOCK_GRAPHIC_ON_VISITED_PAGE,
    properties: {
      top: 0,
      left: 0,
      _pageid: MockObjectName.MOCK_PAGE_VISITED,
    },
  },
  {
    type: 'page',
    id: MockObjectName.MOCK_PAGE_CURRENT,
    properties: {
      diagonaltype: 'manhattan',
      scale_number: 5,
    },
  },
  {
    type: 'page',
    id: MockObjectName.MOCK_PAGE_INACTIVE,
    properties: {
      diagonaltype: 'foure',
      scale_number: 5,
    },
  },
  {
    type: 'page',
    id: MockObjectName.MOCK_PAGE_VISITED,
    properties: { diagonaltype: 'pythagoras', scale_number: 5 },
  },
  { type: 'player', id: MockObjectName.MOCK_PLAYER },
];

const mockRequestResults: Map<string, Roll20Object> = mockObjectParams.reduce(
  (map: Map<string, Roll20Object>, { type, id, properties }) => {
    map.set(id, new MockRoll20Object(type, id, properties));
    return map;
  },
  new Map<string, Roll20Object>()
);

const mockRequestArgs = {
  ids: [...mockRequestResults.keys()],
};

export default {
  mockObjectConstants,
  mockRequestArgs,
  mockRequestResults,
};
