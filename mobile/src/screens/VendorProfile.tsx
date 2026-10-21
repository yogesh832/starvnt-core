import { VendorCategoryPicker } from "../VendorCategoryPicker";
import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  confirm,
  ErrorNotice,
  Field,
  Icon,
  Pill,
  Txt,
  Page,
  useAction,
  useResource,
} from "../ui";

const fields = [
  ["businessName", "Business name"],
  ["brandName", "Brand name"],
  ["category", "Primary category"],
  ["location", "Operating city / hub"],
  ["phone", "Business phone"],
  ["website", "Website"],
  ["bio", "About your business"],
];
export function VendorProfile() {
  const r = useResource(external, "/vendor/profile");
  const a = useAction();
  const [form, setForm] = useState<Data>({});
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Data[]>([]);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (r.data.vendor) setForm(r.data.vendor);
  }, [r.data]);
  async function picture() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const file = Platform.OS === "web" ? null : new File(asset.uri);
    if ((asset.size ?? file?.size ?? 0) > 5 * 1024 * 1024)
      throw new Error("Choose a profile photo smaller than 5 MB.");
    let image: string;
    if (Platform.OS === "web" && asset.file)
      image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read this photo."));
        reader.readAsDataURL(asset.file!);
      });
    else
      image = `data:${asset.mimeType || "image/jpeg"};base64,${await file!.base64()}`;
    await external.call("/vendor/profile/picture", "PUT", { image });
    await r.refresh();
    setNotice("Profile photo saved.");
  }
  async function link(placeId: string) {
    await external.call("/vendor/profile", "PUT", { googlePlaceId: placeId });
    setPlaces([]);
    setSearched(false);
    await r.refresh();
    setNotice(
      placeId ? "Business listing linked." : "Business listing unlinked.",
    );
  }
  return (
    <Page
      {...r}
      title="Business profile & hub"
      subtitle="The same business identity shown to customers on the web."
    >
      <ErrorNotice message={a.error} />
      {!!notice && <Txt>{notice}</Txt>}
      <Card>
        {!!r.data.vendor?.profilePicUrl && (
          <Image
            source={{ uri: r.data.vendor.profilePicUrl }}
            style={{ width: 110, height: 110, borderRadius: 55 }}
            accessibilityLabel="Business profile photo"
          />
        )}
        <Button
          title="Upload / change profile photo"
          secondary
          busy={a.busy}
          onPress={() => a.run(picture)}
        />
        {!!r.data.vendor?.profilePicUrl && (
          <Button
            title="Remove photo"
            secondary
            busy={a.busy}
            onPress={() =>
              confirm(
                "Remove profile photo?",
                "This updates the photo used for your business.",
                () =>
                  a.run(async () => {
                    await external.call("/vendor/profile/picture", "PUT", {
                      image: "",
                    });
                    await r.refresh();
                  }),
              )
            }
          />
        )}
      </Card>
      {fields.map(([key, label]) => key === "category" ? <VendorCategoryPicker key={key} label={label} value={form.category || ""} disabled={a.busy} onChange={(category) => setForm(current => ({ ...current, category }))}/> : (
        <Field
          key={key}
          label={label}
          value={form[key] || ""}
          multiline={key === "bio"}
          editable={!a.busy}
          onChangeText={(value) =>
            setForm((current) => ({ ...current, [key]: value }))
          }
        />
      ))}
      <Button
        title="Save business profile"
        busy={a.busy}
        onPress={() =>
          a.run(async () => {
            if (!String(form.businessName || "").trim())
              throw new Error("Enter your business name.");
            await external.call(
              "/vendor/profile",
              "PUT",
              Object.fromEntries(
                fields.map(([key]) => [key, String(form[key] || "").trim()]),
              ),
            );
            await r.refresh();
            setNotice("Business profile saved.");
          })
        }
      />
      <Card>
        <Txt bold size={22}>
          Google business listing
        </Txt>
        {!!r.data.vendor?.googlePlaceId && (
          <>
            <Pill>LISTING LINKED</Pill>
            <Txt muted>{r.data.vendor.googlePlaceId}</Txt>
            {r.data.googleRating && (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Icon name="star" size={15} color="#f59e0b" />
                <Txt bold size={14}>
                  {r.data.googleRating.rating}
                </Txt>
                <Txt muted size={13}>
                  · {r.data.googleRating.reviewCount} Google reviews
                </Txt>
              </View>
            )}
            <Button
              title="Unlink listing"
              secondary
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Unlink business listing?",
                  "Your business profile stays available.",
                  () => a.run(() => link("")),
                )
              }
            />
          </>
        )}
        <Field
          label="Find your business by name and city"
          value={query}
          onChangeText={setQuery}
          editable={!a.busy}
        />
        <Button
          title="Search business listings"
          secondary
          busy={a.busy}
          disabled={query.trim().length < 2}
          onPress={() =>
            a.run(async () => {
              const result = await external.call(
                `/vendor/google-places/search?q=${encodeURIComponent(query.trim())}`,
              );
              setPlaces(result.places || []);
              setSearched(true);
            })
          }
        />
        {searched && !places.length && (
          <Txt muted>
            No matching listings. Try your business name and city.
          </Txt>
        )}
        {places.map((place) => (
          <Card key={place.id}>
            <Txt bold>{place.name}</Txt>
            <Txt muted>{place.address}</Txt>
            <Pill>
              {place.source === "GOOGLE_PLACES"
                ? "GOOGLE LISTING"
                : "MAP LOCATION · GOOGLE REVIEWS MAY BE UNAVAILABLE"}
            </Pill>
            {place.googleMapsUrl && (
              <Button
                title="View listing"
                secondary
                onPress={() =>
                  a.run(async () => {
                    if (!/^https?:\/\//i.test(place.googleMapsUrl))
                      throw new Error("This listing link is unavailable.");
                    await Linking.openURL(place.googleMapsUrl);
                  })
                }
              />
            )}
            <Button
              title="Link this business listing"
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Link this listing?",
                  `${place.name}\n${place.address}`,
                  () => a.run(() => link(place.id)),
                )
              }
            />
          </Card>
        ))}
      </Card>
    </Page>
  );
}
