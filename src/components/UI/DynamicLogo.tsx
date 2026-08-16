import { Image, View } from "react-native";

type DynamicLogoProps = {
  size?: number;
};

const logo = require("../../../assets/images/splash-icon.png");

export function DynamicLogo({ size = 100 }: DynamicLogoProps) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={logo}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Nova"
      />
    </View>
  );
}

export default DynamicLogo;
