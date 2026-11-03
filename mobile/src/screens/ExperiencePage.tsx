import React, { useState, useEffect } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { API_URL } from '../api/runtime';
import { Page, Card, Txt, Field, Button, ErrorNotice, usePalette, useAction } from '../ui';

export function ExperienceScreen({ route, navigation }: any) {
  const c = usePalette();
  const a = useAction();
  const initialToken = route.params?.token || '';
  const [token, setToken] = useState(initialToken);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [loading, setLoading] = useState(Boolean(initialToken));
  const [data, setData] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [access, setAccess] = useState('');
  const [event, setEvent] = useState<any>(null);

  // Feedback form
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [criteria, setCriteria] = useState({
    quality: 5,
    punctuality: 5,
    staff: 5,
    communication: 5,
  });
  const [reviewText, setReviewText] = useState('');
  const [eventConfirmed, setEventConfirmed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function apiCall(endpoint: string, options: any = {}) {
    const res = await fetch(`${API_URL}/api/experience/${encodeURIComponent(token)}${endpoint}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(access ? { 'X-Feedback-Access': access } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || 'Request failed');
    }
    return json;
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiCall('')
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
      });
  }, [token]);

  const sendOtp = () =>
    a.run(async () => {
      if (!phone.trim()) throw new Error('Please enter your mobile number.');
      await apiCall('/otp', { method: 'POST', body: { phone } });
      setOtpSent(true);
    });

  const verifyOtp = () =>
    a.run(async () => {
      if (!otp.trim()) throw new Error('Please enter the OTP.');
      const res = await apiCall('/verify', { method: 'POST', body: { phone, otp } });
      setAccess(res.accessToken);
      setEvent(res.event);
    });

  const submitFeedback = () =>
    a.run(async () => {
      if (!eventConfirmed) throw new Error('Please confirm that you received this service.');
      if (!name.trim()) throw new Error('Please enter your name.');
      if (!reviewText.trim()) throw new Error('Please share a few words about your experience.');

      await apiCall('/feedback', {
        method: 'POST',
        body: {
          name,
          rating,
          criteria,
          reviewText,
          eventConfirmed: true,
          marketing,
          noticeVersion: data?.notice?.version || '1.0',
          idempotencyKey: `mobile-feedback:${Date.now()}`,
        },
      });
      setSubmitted(true);
    });

  return (
    <Page title="Event Experience" subtitle="Share honest feedback directly with STARVNT">
      <View style={{ gap: 14 }}>
        {!!a.error && <ErrorNotice error={a.error} />}

        {/* Token input if not provided */}
        {!token && (
          <Card>
            <Txt bold size={16}>
              Enter Experience Code
            </Txt>
            <Txt size={12} color={c.muted}>
              Paste your experience token or the code from your QR invite.
            </Txt>
            <Field
              label="Experience Token"
              placeholder="e.g. exp_..."
              value={tokenInput}
              onChangeText={setTokenInput}
            />
            <Button
              title="Look Up Experience"
              onPress={() => setToken(tokenInput.trim())}
              disabled={!tokenInput.trim()}
            />
          </Card>
        )}

        {/* Loading state */}
        {loading && (
          <Card>
            <Txt size={14} color={c.muted}>
              Loading event details...
            </Txt>
          </Card>
        )}

        {/* Loaded Experience Info */}
        {data && !access && !submitted && (
          <>
            <Card>
              <Txt bold size={18}>
                {data.vendorName}
              </Txt>
              <Txt size={13} color={c.muted}>
                {data.notice?.text || 'Thank you for celebrating with us. Your feedback helps build trust.'}
              </Txt>
            </Card>

            <Card>
              <Txt bold size={16}>
                Verify Your Mobile
              </Txt>
              <Txt size={12} color={c.muted}>
                Enter the mobile number linked to your booking to unlock feedback.
              </Txt>

              <Field
                label="Mobile number (with country code)"
                placeholder="+91..."
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setOtpSent(false);
                }}
              />

              {!otpSent ? (
                <Button title="Send OTP" onPress={sendOtp} busy={a.busy} />
              ) : (
                <>
                  <Field
                    label="Enter OTP"
                    placeholder="6-digit code"
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                  />
                  <Button title="Verify & Continue" onPress={verifyOtp} busy={a.busy} />
                </>
              )}
            </Card>
          </>
        )}

        {/* Feedback Form after OTP Verification */}
        {access && !submitted && (
          <>
            {event && (
              <Card>
                <Txt bold size={16}>
                  {event.service || 'Service completed'}
                </Txt>
                <Txt size={12} color={c.muted}>
                  Date: {event.date}
                </Txt>
              </Card>
            )}

            <Card>
              <Txt bold size={16}>
                Your Experience Rating
              </Txt>

              {/* Overall Rating Star Selector */}
              <View style={{ gap: 6, marginVertical: 8 }}>
                <Txt bold size={13}>
                  Overall satisfaction: {rating} / 5
                </Txt>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      accessibilityRole="button"
                      onPress={() => setRating(star)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: rating >= star ? c.accent : c.card,
                        borderWidth: 1,
                        borderColor: c.line,
                      }}
                    >
                      <Txt bold color={rating >= star ? '#fff' : c.ink}>
                        {star} ★
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Criteria Ratings */}
              <View style={{ gap: 8, marginTop: 10 }}>
                {Object.entries(criteria).map(([key, val]) => (
                  <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Txt size={13}>{key.charAt(0).toUpperCase() + key.slice(1)}</Txt>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="button"
                          onPress={() => setCriteria((prev) => ({ ...prev, [key]: n }))}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: val >= n ? c.accent : c.card,
                          }}
                        >
                          <Txt size={11} bold color={val >= n ? '#fff' : c.muted}>
                            {n}
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              <Field
                label="Your Name"
                placeholder="Name as you'd like it to appear"
                value={name}
                onChangeText={setName}
              />

              <Field
                label="Written Review"
                placeholder="What went well? Any highlights from your event?"
                multiline
                numberOfLines={4}
                value={reviewText}
                onChangeText={setReviewText}
              />

              {/* Confirmation Checkbox */}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: eventConfirmed }}
                onPress={() => setEventConfirmed(!eventConfirmed)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: eventConfirmed ? c.accent : c.muted,
                    backgroundColor: eventConfirmed ? c.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {eventConfirmed && <Txt bold color="#fff" size={12}>✓</Txt>}
                </View>
                <Txt size={12} color={c.ink} style={{ flex: 1 }}>
                  I received the event service described above.
                </Txt>
              </Pressable>

              <Button
                title="Submit Feedback"
                onPress={submitFeedback}
                busy={a.busy}
                disabled={!eventConfirmed || !name.trim() || !reviewText.trim()}
              />
            </Card>
          </>
        )}

        {/* Success confirmation */}
        {submitted && (
          <Card>
            <Txt bold size={20} color={c.accent}>
              Thank You! 🎉
            </Txt>
            <Txt size={14} color={c.ink}>
              Your feedback has been verified and recorded. It helps the vendor improve and allows other customers to discover quality event services.
            </Txt>
            <Button
              title="Return to Home"
              onPress={() => navigation?.navigate?.('Landing')}
            />
          </Card>
        )}
      </View>
    </Page>
  );
}
