import { Linking, Pressable, View } from 'react-native';
import { Page, Txt, usePalette } from '../ui';
import { PORTAL_SURFACE } from '../portalAccess';
import { useSignupDocuments } from '../useSignupDocuments';

export function LegalNoticeScreen({ route }: any) {
  const c = usePalette();
  const privacy = route?.params?.kind !== 'terms';
  const title = privacy ? 'Privacy Policy' : 'Terms of Service';
  const { documents, loading, error } = useSignupDocuments(PORTAL_SURFACE);
  const document = documents?.find(row => row.kind === (privacy ? 'privacy' : 'terms'));
  return <Page title={title} subtitle="STARVNT · Legal information">
    <View style={{ gap: 16, padding: 18, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      {document ? <>
        <Txt muted>Version {document.version} · Effective {document.effectiveFrom.slice(0, 10)}</Txt>
        <Txt>{document.body}</Txt>
      </> : <>
        <Txt>{loading ? 'Loading legal document…' : error ? 'Could not load this document. Reopen this screen to retry.' : 'This document has yet to be published.'}</Txt>
        {!loading && <Pressable accessibilityRole="link" onPress={() => Linking.openURL('mailto:support@starvnt.com?subject=STARVNT%20legal%20document')}>
          <Txt bold style={{ color: c.accent }}>Email support@starvnt.com</Txt>
        </Pressable>}
      </>}
    </View>
  </Page>;
}
