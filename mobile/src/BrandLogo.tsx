import React, { useId } from "react";
import { Image, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import brand from "./brand.generated.json";
import { usePalette } from "./Theme";

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/brand/starvnt-icon.png")}
      accessibilityIgnoresInvertColors
      accessibilityLabel="StarVnt logo"
      style={{ width: size, height: size, borderRadius: 8 }}
      resizeMode="contain"
    />
  );
}
/** Same mark, spelling, gradient and tagline as web/components/ui.jsx LogoWord. */
export function LogoWord({
  compact = false,
  light = false,
  sub = "EVENTS. SIMPLIFIED.",
}: {
  compact?: boolean;
  light?: boolean;
  sub?: string;
}) {
  const c = usePalette();
  const gradientId = `wordmark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      accessible
      accessibilityLabel={`StarVnt. ${sub}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
    >
      <LogoMark size={compact ? 32 : 42} />
      <View style={{ gap: 1 }}>
        <Svg
          width={compact ? 97 : 124}
          height={compact ? 25 : 32}
          viewBox="0 0 124 32"
        >
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              {brand.wordmarkGradient.map((color, i) => (
                <Stop
                  key={color}
                  offset={`${i * 50}%`}
                  stopColor={i === 0 ? c.accent : color}
                />
              ))}
            </LinearGradient>
          </Defs>
          <SvgText
            x="0"
            y="26"
            fill={light ? "#ffffff" : `url(#${gradientId})`}
            fontSize="28"
            fontFamily="Inter_800ExtraBold"
            fontWeight="800"
            letterSpacing="-1"
          >
            StarVnt
          </SvgText>
        </Svg>
        {!compact && (
          <Svg width={146} height={12} viewBox="0 0 146 12">
            <SvgText
              x="0"
              y="9"
              fill={light ? "#cbd5e1" : c.muted}
              fontSize="8"
              fontFamily="Inter_600SemiBold"
              letterSpacing="1.4"
            >
              {sub}
            </SvgText>
          </Svg>
        )}
      </View>
    </View>
  );
}
