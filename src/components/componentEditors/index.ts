import type { ComponentEditorProps } from './types';
import { MetaDataEditor } from './MetaDataEditor';
import { BatteryEditor } from './BatteryEditor';
import { SurveillanceCameraEditor } from './SurveillanceCameraEditor';
import { AtmosPipeColorEditor } from './AtmosPipeColorEditor';
import { DeviceListEditor } from './DeviceListEditor';
import { DeviceLinkSourceEditor } from './DeviceLinkSourceEditor';
import { GenericComponentEditor } from './GenericComponentEditor';

const COMPONENT_EDITORS: Record<string, React.FC<ComponentEditorProps>> = {
  MetaData: MetaDataEditor,
  Battery: BatteryEditor,
  SurveillanceCamera: SurveillanceCameraEditor,
  AtmosPipeColor: AtmosPipeColorEditor,
  DeviceList: DeviceListEditor,
  DeviceLinkSource: DeviceLinkSourceEditor,
};

export function getComponentEditor(type: string): React.FC<ComponentEditorProps> {
  return COMPONENT_EDITORS[type] ?? GenericComponentEditor;
}
