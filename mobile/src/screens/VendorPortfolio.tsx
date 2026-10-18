import React, { useState } from "react";
import { Image, Linking } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import { pickUploads } from "../api/upload";
import { EventDateField } from "../EventFields";
import { portfolioProject } from "../portfolio";
import {
  Button,
  Card,
  Choice,
  confirm,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  Page,
  Pill,
  Txt,
  useAction,
  useResource,
} from "../ui";

const blank = {
  projectName: "",
  eventType: "",
  eventDate: "",
  venue: "",
  locality: "",
  city: "",
  style: "",
  description: "",
  tags: "",
};

export function VendorPortfolio() {
  const r = useResource(external, "/vendor/portfolio/projects");
  const a = useAction();
  const [form, setForm] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [media, setMedia] = useState<Data[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Data | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [status, setStatus] = useState("VENDOR_REVIEW");
  const patch = (key: string, value: string) =>
    setDraft((v) => ({ ...v, [key]: value }));
  const projects: Data[] = (r.data.projects || []).filter((p: Data) =>
    `${p.projectName} ${p.location?.city || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const refresh = async () => {
    await r.refresh();
  };
  return (
    <Page
      {...r}
      title="Your portfolio"
      subtitle="Projects, photographs and films from your work."
    >
      <ErrorNotice message={a.error} />
      <Button
        title={form ? "Close new project" : "Create a project"}
        secondary
        disabled={a.busy}
        onPress={() => setForm(!form)}
      />
      {form && (
        <Card>
          <Txt bold size={21}>
            New showcase
          </Txt>
          <Field
            label="Project name"
            value={draft.projectName}
            onChangeText={(v) => patch("projectName", v)}
          />
          <Field
            label="Event type"
            value={draft.eventType}
            onChangeText={(v) => patch("eventType", v)}
          />
          <EventDateField
            label="Event date"
            value={draft.eventDate}
            onChange={(v) => patch("eventDate", v)}
          />
          <Field
            label="Venue"
            value={draft.venue}
            onChangeText={(v) => patch("venue", v)}
          />
          <Field
            label="Locality"
            value={draft.locality}
            onChangeText={(v) => patch("locality", v)}
          />
          <Field
            label="City"
            value={draft.city}
            onChangeText={(v) => patch("city", v)}
          />
          <Field
            label="Style"
            value={draft.style}
            onChangeText={(v) => patch("style", v)}
          />
          <Field
            label="Description"
            multiline
            value={draft.description}
            onChangeText={(v) => patch("description", v)}
          />
          <Field
            label="Tags, separated by commas"
            value={draft.tags}
            onChangeText={(v) => patch("tags", v)}
          />
          <Choice
            label="Visibility"
            values={["VENDOR_REVIEW", "PUBLISHED"]}
            labels={{
              VENDOR_REVIEW: "Draft for review",
              PUBLISHED: "Published",
            }}
            value={status}
            onChange={setStatus}
          />
          <Button
            title="Add photos & videos"
            secondary
            busy={a.busy}
            onPress={() =>
              a.run(async () => {
                const result = await pickUploads(true);
                setMedia((v) => [...v, ...result.uploads]);
                setFailures(result.failures);
              })
            }
          />
          {!!failures.length && <ErrorNotice message={failures.join("\n")} />}
          {media.map((m, index) => (
            <Card key={`${m.url}-${index}`}>
              <Txt>{m.filename || `Media ${index + 1}`}</Txt>
              <Button
                title="Remove from this project"
                secondary
                disabled={a.busy}
                onPress={() => setMedia((v) => v.filter((_, i) => i !== index))}
              />
            </Card>
          ))}
          <Button
            title={
              status === "PUBLISHED" ? "Publish project" : "Save draft project"
            }
            busy={a.busy}
            onPress={() =>
              a.run(async () => {
                await external.call(
                  "/vendor/portfolio/project",
                  "POST",
                  portfolioProject(draft, media, status),
                );
                setDraft(blank);
                setMedia([]);
                setFailures([]);
                setForm(false);
                await refresh();
              })
            }
          />
        </Card>
      )}
      <Field label="Search projects" value={query} onChangeText={setQuery} />
      {!projects.length && (
        <Empty
          title="No matching portfolio projects"
          description="Create a showcase with photos and videos from your work."
        />
      )}
      {projects.map((project) => (
        <Card key={project.projectName}>
          <Txt bold size={22}>
            {project.projectName}
          </Txt>
          <Txt muted>
            {[project.eventType, project.location?.city, project.style]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
          {!!project.description && <Txt>{project.description}</Txt>}
          {(project.items || []).map((item: Data) => (
            <Card key={id(item)}>
              {item.mediaType === "IMAGE" && !!item.url && (
                <Image
                  source={{ uri: item.thumbnailUrl || item.url }}
                  accessibilityLabel={item.title || project.projectName}
                  style={{ width: "100%", height: 200, borderRadius: 14 }}
                  resizeMode="cover"
                />
              )}
              <Txt bold>{item.title || human(item.mediaType)}</Txt>
              <Pill>{human(item.status)}</Pill>
              {!!item.description && <Txt>{item.description}</Txt>}
              <Button
                title="Open media"
                secondary
                onPress={() =>
                  a.run(async () => {
                    if (!/^https?:\/\//i.test(item.url || ""))
                      throw new Error("This media link is unavailable.");
                    await Linking.openURL(item.url);
                  })
                }
              />
              <Button
                title="Edit title & description"
                secondary
                disabled={a.busy}
                onPress={() => {
                  setEditing(item);
                  setItemTitle(item.title || "");
                  setItemDescription(item.description || "");
                }}
              />
              {editing && id(editing) === id(item) && (
                <>
                  <Field
                    label="Media title"
                    value={itemTitle}
                    onChangeText={setItemTitle}
                  />
                  <Field
                    label="Description"
                    multiline
                    value={itemDescription}
                    onChangeText={setItemDescription}
                  />
                  <Button
                    title="Save media details"
                    busy={a.busy}
                    onPress={() =>
                      a.run(async () => {
                        await external.call(
                          "/vendor/portfolio/publish",
                          "POST",
                          {
                            itemIds: [id(item)],
                            bulkUpdates: {
                              title: itemTitle.trim(),
                              description: itemDescription.trim(),
                              status: item.status,
                            },
                          },
                        );
                        setEditing(null);
                        await refresh();
                      })
                    }
                  />
                  <Button
                    title="Cancel editing"
                    secondary
                    onPress={() => setEditing(null)}
                  />
                </>
              )}
              <Button
                title="Delete media"
                danger
                disabled={a.busy}
                onPress={() =>
                  confirm(
                    "Delete this media?",
                    "This removes it from your portfolio.",
                    () =>
                      a.run(async () => {
                        await external.call(
                          `/vendor/portfolio/items/${id(item)}`,
                          "DELETE",
                        );
                        await refresh();
                      }),
                  )
                }
              />
            </Card>
          ))}
          {(project.items || []).some((v: Data) =>
            ["UPLOADED", "VENDOR_REVIEW"].includes(v.status),
          ) && (
            <Button
              title="Publish draft media"
              busy={a.busy}
              onPress={() =>
                confirm(
                  "Publish draft media?",
                  "These items will become visible in your public portfolio.",
                  () =>
                    a.run(async () => {
                      await external.call("/vendor/portfolio/publish", "POST", {
                        itemIds: project.items
                          .filter((v: Data) =>
                            ["UPLOADED", "VENDOR_REVIEW"].includes(v.status),
                          )
                          .map(id),
                      });
                      await refresh();
                    }),
                )
              }
            />
          )}
          <Button
            title="Delete project"
            danger
            disabled={a.busy}
            onPress={() =>
              confirm(
                "Delete this project?",
                "This removes the project and all its portfolio media.",
                () =>
                  a.run(async () => {
                    await external.call(
                      `/vendor/portfolio/projects/${encodeURIComponent(project.projectName)}`,
                      "DELETE",
                    );
                    await refresh();
                  }),
              )
            }
          />
        </Card>
      ))}
    </Page>
  );
}
