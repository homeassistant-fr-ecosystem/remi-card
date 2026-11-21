export interface RemiCardConfig {
  type: string;
  device_id: string;
  device_prefix?: string;
  device_name?: string;
  title?: string;
  show_controls?: boolean;
  show_face_selector?: boolean;
  show_temperature_graph?: boolean;
  show_connectivity?: boolean;
  show_alarm_clocks?: boolean;
  hours_to_show?: number;
  /** Per-role entity id overrides. */
  face?: string;
  night_light?: string;
  temperature?: string;
  luminosity?: string;
  connectivity?: string;
  rssi?: string;
  firmware_version?: string;
  ip_address?: string;
  clock_format?: string;
  music_mode?: string;
  volume_control?: string;
  noise_threshold?: string;
  night_face_level?: string;
  alive?: string;
  firmware_update?: string;
}
