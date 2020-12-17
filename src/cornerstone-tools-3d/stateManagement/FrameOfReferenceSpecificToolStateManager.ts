import uuidv4 from '../util/uuidv4.js';
import type {
  ToolSpecificToolData,
  ToolSpecificToolState,
  FrameOfReferenceSpecificToolState,
  ToolState,
} from './types';
import cloneDeep from 'lodash.clonedeep';

import { Events as RENDERING_EVENTS, renderingEventTarget } from '../../index';

interface FilterInterface {
  FrameOfReferenceUID?: string;
  toolName?: string;
}

export default class FrameOfReferenceSpecificToolStateManager {
  private toolState: ToolState;
  public readonly uid: string;

  constructor(uid?: string) {
    if (!uid) {
      uid = uuidv4();
    }
    this.toolState = {};
    this.uid = uid;

    renderingEventTarget.addEventListener(
      RENDERING_EVENTS.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedHandler
    );
  }

  _imageVolumeModifiedHandler = evt => {
    const eventData = evt.detail;
    const { FrameOfReferenceUID } = eventData;

    const toolState = this.toolState;
    const frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificToolState) {
      return;
    }

    Object.keys(frameOfReferenceSpecificToolState).forEach(toolName => {
      const toolSpecificToolState = frameOfReferenceSpecificToolState[toolName];

      toolSpecificToolState.forEach(toolData => {
        const { data } = toolData;

        if (data && data.invalidated !== undefined) {
          data.invalidated = true;
        }
      });
    });
  };

  get = (FrameOfReferenceUID, toolName) => {
    const frameOfReferenceSpecificToolState = this.toolState[
      FrameOfReferenceUID
    ];

    if (!frameOfReferenceSpecificToolState) {
      return;
    }

    return frameOfReferenceSpecificToolState[toolName];
  };

  /**
   * @method getToolStateByToolUID Given the unique identified for the some `toolData`,
   * returns the `toolData` from the `toolState`. Searches are more efficient if either/both of
   * the `FrameOfReferenceUID` and the `toolName` are given by the `filter`.
   *
   * @param {string} toolUID The unique identifier of the `toolData`.
   * @param {FilterInterface} [filter] A `filter` which reduces the scope of the search.
   *
   * @returns {ToolSpecificToolData} The retrieved `toolData`.
   */
  getToolStateByToolUID = (
    toolUID: string,
    filter: FilterInterface = {}
  ): ToolSpecificToolData => {
    const toolSpecificToolStateAndIndex = this._getToolSpecificToolStateAndIndex(
      toolUID,
      filter
    );

    if (!toolSpecificToolStateAndIndex) {
      return;
    }

    const { toolSpecificToolState, index } = toolSpecificToolStateAndIndex;

    return toolSpecificToolState[index];
  };

  /**
   * @method addToolState Adds an instance of `ToolSpecificToolData` to the `toolState`.
   *
   * @param {ToolSpecificToolData} toolData The toolData to add.
   */
  addToolState = (toolData: ToolSpecificToolData) => {
    const { metadata } = toolData;
    const { FrameOfReferenceUID, toolName } = metadata;

    const toolState = this.toolState;

    let frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificToolState) {
      toolState[FrameOfReferenceUID] = {};

      frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];
    }

    let toolSpecificToolState = frameOfReferenceSpecificToolState[toolName];

    if (!toolSpecificToolState) {
      frameOfReferenceSpecificToolState[toolName] = [];

      toolSpecificToolState = frameOfReferenceSpecificToolState[toolName];
    }

    toolSpecificToolState.push(toolData);
  };

  /**
   * @method removeToolState Removes an instance of `ToolSpecificToolData` from the `toolState`.
   *
   * @param {ToolSpecificToolData} toolData The toolData to remove.
   */
  removeToolState = (toolData: ToolSpecificToolData) => {
    const { metadata } = toolData;
    const { FrameOfReferenceUID, toolName, toolUID } = metadata;
    const toolState = this.toolState;

    const frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

    if (!frameOfReferenceSpecificToolState) {
      throw new Error(
        `frameOfReferenceSpecificToolState with FrameOfReferenceUID ${FrameOfReferenceUID} does not exist.`
      );
    }

    const toolSpecificToolState = frameOfReferenceSpecificToolState[toolName];
    if (!toolSpecificToolState) {
      throw new Error(
        `toolSpecificToolState for toolName ${toolName} on FrameOfReferenceUID ${FrameOfReferenceUID} does not exist.`
      );
    }

    const index = toolSpecificToolState.findIndex(
      toolData => toolData.metadata.toolUID === toolUID
    );

    toolSpecificToolState.splice(index, 1);
  };

  /**
   * @method removeToolStateByToolUID Given the unique identified for the some `toolData`,
   * removes the `toolData` from the `toolState`. Searches are more efficient if either/both of
   * the `FrameOfReferenceUID` and the `toolName` are given by the `filter`.
   *
   * @param {string} toolUID The unique identifier of the `toolData` to remove.
   * @param {FilterInterface} [filter] A `filter` which reduces the scope of the search.
   */
  removeToolStateByToolUID = (
    toolUID: string,
    filter: FilterInterface = {}
  ) => {
    const toolSpecificToolStateAndIndex = this._getToolSpecificToolStateAndIndex(
      toolUID,
      filter
    );

    if (!toolSpecificToolStateAndIndex) {
      return;
    }

    const { toolSpecificToolState, index } = toolSpecificToolStateAndIndex;

    toolSpecificToolState.splice(index, 1);
  };

  /**
   * @method saveToolState Returns a section of the toolState. Useful for serialization.
   *
   * - If no arguments are given, the entire `ToolState` instance is returned.
   * - If the `FrameOfReferenceUID` is given, the corresponding
   * `FrameOfReferenceSpecificToolState` instance is returned.
   * - If both the `FrameOfReferenceUID` and the `toolName` are are given, the
   * corresponding `ToolSpecificToolState` instance is returned.
   *
   * @param {string} [FrameOfReferenceUID] A filter string for returning the `toolState` of a specific frame of reference.
   * @param {string} [toolName] A filter string for returning `toolState` for a specific tool on a specific frame of reference.
   *
   * @returns {ToolSpecificToolData} The retrieved `toolData`.
   */
  saveToolState = (
    FrameOfReferenceUID?: string,
    toolName?: string
  ): ToolState | FrameOfReferenceSpecificToolState | ToolSpecificToolState => {
    const toolState = this.toolState;

    if (FrameOfReferenceUID && toolName) {
      const frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

      if (!frameOfReferenceSpecificToolState) {
        return;
      }

      const toolSpecificToolState = frameOfReferenceSpecificToolState[toolName];

      return cloneDeep(toolSpecificToolState);
    } else if (FrameOfReferenceUID) {
      const frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

      return cloneDeep(frameOfReferenceSpecificToolState);
    }

    return cloneDeep(toolState);
  };

  /**
   * @method restoreToolState Restores a section of the `toolState`. Useful for loading in serialized data.
   *
   * - If no arguments are given, the entire `ToolState` instance is restored.
   * - If the `FrameOfReferenceUID` is given, the corresponding
   * `FrameOfReferenceSpecificToolState` instance is restored.
   * - If both the `FrameOfReferenceUID` and the `toolName` are are given, the
   * corresponding `ToolSpecificToolState` instance is restored.
   *
   * @param {string} [FrameOfReferenceUID] A filter string for restoring only the `toolState` of a specific frame of reference.
   * @param {string} [toolName] A filter string for restoring `toolData` for a specific tool on a specific frame of reference.
   */
  restoreToolState = (
    state:
      | ToolState
      | FrameOfReferenceSpecificToolState
      | ToolSpecificToolState,
    FrameOfReferenceUID?: string,
    toolName?: string
  ) => {
    const toolState = this.toolState;

    if (FrameOfReferenceUID && toolName) {
      // Set ToolSpecificToolState for FrameOfReferenceUID and toolName.

      let frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];

      if (!frameOfReferenceSpecificToolState) {
        toolState[FrameOfReferenceUID] = {};

        frameOfReferenceSpecificToolState = toolState[FrameOfReferenceUID];
      }

      frameOfReferenceSpecificToolState[toolName] = <ToolSpecificToolState>(
        state
      );
    } else if (FrameOfReferenceUID) {
      // Set FrameOfReferenceSpecificToolState for FrameOfReferenceUID.

      toolState[FrameOfReferenceUID] = <FrameOfReferenceSpecificToolState>state;
    } else {
      // Set entire toolState

      this.toolState = <ToolState>state;
    }
  };

  /**
   * @method _getToolSpecificToolStateAndIndex Given the unique identifier for a tool,
   * returns the `ToolSpecificToolState` it belongs to, and the `index` of its position in that array.
   *
   * @param {string} toolUID The unique identifier of the `toolData`.
   * @param {FilterInterface} [filter] A `filter` which reduces the scope of the search.
   *
   * @returns {object}
   * @returns {object.toolSpecificToolState} The `ToolSpecificToolState` instance containing the `toolData`.
   * @returns {object.index} The `index` of the `toolData` in the `toolSpecificToolState` array.
   */
  private _getToolSpecificToolStateAndIndex(
    toolUID: string,
    filter: FilterInterface
  ): { toolSpecificToolState: ToolSpecificToolState; index: number } {
    const { toolName, FrameOfReferenceUID } = filter;
    const toolState = this.toolState;

    let frameOfReferenceUIDKeys;

    if (FrameOfReferenceUID) {
      frameOfReferenceUIDKeys = [FrameOfReferenceUID];
    } else {
      frameOfReferenceUIDKeys = Object.keys(toolState);
    }

    const numFrameOfReferenceUIDKeys = frameOfReferenceUIDKeys.length;

    for (let i = 0; i < numFrameOfReferenceUIDKeys; i++) {
      const frameOfReferenceUID = frameOfReferenceUIDKeys[i];
      const frameOfReferenceSpecificToolState = toolState[frameOfReferenceUID];

      let toolNameKeys;

      if (toolName) {
        toolNameKeys = [toolName];
      } else {
        toolNameKeys = Object.keys(frameOfReferenceSpecificToolState);
      }

      const numToolNameKeys = toolNameKeys.length;

      for (let j = 0; j < numToolNameKeys; j++) {
        const toolName = toolNameKeys[j];

        const toolSpecificToolState =
          frameOfReferenceSpecificToolState[toolName];

        const index = toolSpecificToolState.findIndex(
          toolData => toolData.metadata.toolUID === toolUID
        );

        if (index !== -1) {
          return { toolSpecificToolState, index };
        }
      }
    }
  }
}

const defaultFrameOfReferenceSpecificToolStateManager = new FrameOfReferenceSpecificToolStateManager(
  'DEFAULT'
);

export { defaultFrameOfReferenceSpecificToolStateManager };
