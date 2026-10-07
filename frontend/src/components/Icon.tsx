import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { colors } from "./theme";
const icons = {
  arrow: "arrow-forward-outline",
  back: "arrow-back-outline",
  check: "checkmark-outline",
  shield: "shield-checkmark-outline",
  phone: "call-outline",
  user: "person-outline",
  lock: "lock-closed-outline",
  eye: "eye-outline",
  copy: "copy-outline",
  refresh: "refresh-outline",
  edit: "create-outline",
  link: "link-outline",
  trash: "trash-outline",
  close: "close-outline",
  logout: "log-out-outline",
  info: "information-circle-outline",
  qr: "qr-code-outline",
  share: "share-social-outline",
  home: "home-outline",
  download: "download-outline",
  chevron: "chevron-forward-outline",
  settings: "settings-outline",
  help: "help-circle-outline",
  heart: "heart-outline",
  people: "people-outline",
  flash: "flash-outline",
  power: "power-outline",
  globe: "globe-outline",
  mail: "mail-outline",
  camera: "camera-outline",
} satisfies Record<string, ComponentProps<typeof Ionicons>["name"]>;
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  color = colors.primary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={icons[name]}
      size={size}
      color={color}
      accessible={false}
      aria-hidden
    />
  );
}
