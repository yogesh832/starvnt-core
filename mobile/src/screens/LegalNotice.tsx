import { Linking, Pressable, View } from 'react-native';
import { Page, Txt, usePalette } from '../ui';

export function LegalNoticeScreen({ route }: any) {
  const c = usePalette();
  const privacy = route?.params?.kind !== 'terms';
  const title = privacy ? 'Privacy Policy' : 'Terms of Service';
  return <Page title={title} subtitle="STARVNT · Legal information">
    <View style={{ gap: 16, padding: 18, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Txt>This document is not published yet. STARVNT is preparing the approved {privacy ? 'privacy notice' : 'service terms'}.</Txt>
      <Txt muted>Contact STARVNT if you need this information before continuing.</Txt>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('mailto:support@starvnt.com?subject=STARVNT%20legal%20document')}>
        <Txt bold style={{ color: c.accent }}>Email support@starvnt.com</Txt>
      </Pressable>
    </View>
  </Page>;
}
