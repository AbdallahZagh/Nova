import type { ReactNode } from "react";
import Svg, { Path } from "react-native-svg";

type IconProps = {
  color: string;
  size?: number;
};

function StrokeIcon({
  color,
  size = 18,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function PenIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="M12 19h9" />
      <Path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </StrokeIcon>
  );
}

export function HighlighterIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="m9 11-6 6v3h9l3-3" />
      <Path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </StrokeIcon>
  );
}

export function EraserIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <Path d="M22 21H7" />
      <Path d="m5 11 9 9" />
    </StrokeIcon>
  );
}

export function UndoIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </StrokeIcon>
  );
}

export function RedoIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="m15 14 5-5-5-5" />
      <Path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
    </StrokeIcon>
  );
}

export function TrashIcon({ color, size }: IconProps) {
  return (
    <StrokeIcon color={color} size={size}>
      <Path d="M3 6h18" />
      <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
    </StrokeIcon>
  );
}
