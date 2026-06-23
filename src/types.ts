export interface RemiCardConfig {
  type: string;
  device_id: string;
  device_prefix: string;
  device_name?: string;
  title?: string;
  show_controls?: boolean;
  show_face_selector?: boolean;
  show_temperature_graph?: boolean;
  show_connectivity?: boolean;
  show_alarm_clocks?: boolean;
  hours_to_show?: number;
}
