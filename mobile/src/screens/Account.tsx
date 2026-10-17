import React, { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { external, internal } from "../api/runtime";
import { useSession } from "../auth/Session";
import { pickUpload } from "../api/upload";
import { shareDocument } from "../api/documents";
import type { Data } from "../api/client";
import {
  Button,
  Card,
  confirm,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  MenuRow,
  money,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";

export function AccountScreen({ navigation }: any) {
  const s = useSession();
  const a = useAction();
  const isAdmin = s.activeDomain === "admin";
  const user = isAdmin ? s.admin : s.user;
  const vendor = user?.accountType === "VENDOR";
  return (
    <Page title="Your corner of STARVNT" subtitle={user?.email}>
      <Card>
        <Pill>
          {isAdmin ? human(user?.role) : vendor ? "VENDOR OS" : "CUSTOMER"}
        </Pill>
        <Txt bold size={27}>
          {user?.fullName}
        </Txt>
      </Card>
      <ErrorNotice message={a.error} />
      {!isAdmin && (
        <>
          <MenuRow
            title={vendor ? "Business profile & hub" : "Personal details"}
            icon="person-outline"
            onPress={() => navigation.navigate("Profile")}
          />
          {!vendor && (
            <>
              <MenuRow
                title="Documents"
                icon="folder-outline"
                onPress={() =>
                  navigation.navigate("Library", { kind: "documents" })
                }
              />
              <MenuRow
                title="Favorites"
                icon="heart-outline"
                onPress={() =>
                  navigation.navigate("Library", { kind: "favorites" })
                }
              />
            </>
          )}
          <Button
            title={
              vendor
                ? "Switch to customer workspace"
                : "Switch to vendor workspace"
            }
            secondary
            busy={a.busy}
            onPress={() => {
              void a.run(() => s.switchSurface(vendor ? "CUSTOMER" : "VENDOR"));
            }}
          />
        </>
      )}
      <Button
        title={
          isAdmin
            ? "Open customer / vendor workspace"
            : "Internal team workspace"
        }
        secondary
        onPress={() => s.setActiveDomain(isAdmin ? "external" : "admin")}
      />
      <Button
        title="Sign out of this workspace"
        secondary
        busy={a.busy}
        onPress={() =>
          confirm(
            "Sign out?",
            "This revokes the current session on the server and removes it from this device.",
            () => {
              void a.run(() => s.logout(isAdmin));
            },
          )
        }
      />
    </Page>
  );
}
export function ProfileScreen() {
  const { user } = useSession();
  const vendor = user?.accountType === "VENDOR";
  const r = useResource(
    external,
    vendor ? "/vendor/profile" : "/customer/profile",
  );
  const a = useAction();
  const [form, setForm] = useState<Data>({});
  useEffect(() => {
    setForm(vendor ? r.data.vendor || {} : r.data.profile || {});
  }, [r.data, vendor]);
  const fields = vendor
    ? [
        ["businessName", "Business name"],
        ["category", "Primary category"],
        ["location", "Operating city / hub"],
        ["phone", "Business phone"],
        ["website", "Website"],
        ["bio", "About your business"],
      ]
    : [
        ["fullName", "Full name"],
        ["phone", "Phone number"],
      ];
  return (
    <Page
      {...r}
      title={vendor ? "Make your business shine" : "Your personal details"}
    >
      {fields.map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={form[key] || ""}
          onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
          multiline={key === "bio"}
        />
      ))}
      <ErrorNotice message={a.error} />
      <Button
        title="Save profile"
        busy={a.busy}
        onPress={() => {
          void a.run(async () => {
            await external.call(
              vendor ? "/vendor/profile" : "/customer/profile",
              vendor ? "PUT" : "PATCH",
              Object.fromEntries(fields.map(([key]) => [key, form[key] || ""])),
            );
            Alert.alert("Profile saved");
            r.refresh();
          });
        }}
      />
    </Page>
  );
}
export function LibraryScreen({ route, navigation }: any) {
  const { kind } = route.params;
  const r = useResource(external, `/customer/${kind}`);
  const a = useAction();
  return (
    <Page {...r} title={human(kind)}>
      <ErrorNotice message={a.error} />
      {kind === "documents" && (
        <Button
          title="Upload a contract"
          secondary
          busy={a.busy}
          onPress={() => {
            void a.run(async () => {
              const upload = await pickUpload(false, "application/pdf");
              if (!upload) return;
              await external.call("/customer/documents/contracts", "POST", {
                title: upload.filename,
                fileUrl: upload.url,
                fileName: upload.filename,
                fileSize: upload.fileSize,
              });
              r.refresh();
            });
          }}
        />
      )}
      {(r.data[kind] || []).map((item: Data) => (
        <Card key={id(item)}>
          <Pill>{human(item.type)}</Pill>
          <Txt bold size={20}>
            {item.title || item.vendorName}
          </Txt>
          {item.packageName && <Txt muted>{item.packageName}</Txt>}
          {item.amount != null && <Txt>{money(item.amount)}</Txt>}
          {kind === "documents" && (
            <Button
              title="Open or share document"
              secondary
              busy={a.busy}
              onPress={() => {
                void a.run(() => shareDocument(id(item)));
              }}
            />
          )}
          {kind === "favorites" && item.event?.id && item.optionId && (
            <Button
              title="View service"
              secondary
              onPress={() =>
                navigation.navigate("Service", {
                  eventId: item.event.id,
                  optionId: item.optionId,
                })
              }
            />
          )}
          {kind === "favorites" && item.type === "saved_vendor" && (
            <Button
              title="Remove favorite"
              secondary
              busy={a.busy}
              onPress={() => {
                void a.run(async () => {
                  await external.call(
                    `/customer/favorites/${id(item)}`,
                    "DELETE",
                  );
                  r.refresh();
                });
              }}
            />
          )}
        </Card>
      ))}
      {!r.data[kind]?.length && <Empty title={`No ${kind} yet`} />}
    </Page>
  );
}
