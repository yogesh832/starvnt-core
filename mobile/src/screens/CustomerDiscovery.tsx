import React, { useState } from "react";
import { Image, Linking, ScrollView, View } from "react-native";
import { external } from "../api/runtime";
import type { Data } from "../api/client";
import {
  comparisonChoice,
  optionAvailability,
  selectionReason,
  sortOptions,
} from "../discoveryModel";
import { reviewText, reviewerName } from "../vendorInsights";
import {
  Button,
  Card,
  Choice,
  Empty,
  ErrorNotice,
  Field,
  human,
  id,
  money,
  Page,
  Pill,
  Txt,
  useAction,
  usePalette,
  useResource,
} from "../ui";
const eventPath = (eventId: string) =>
  `/customer/events/${encodeURIComponent(eventId)}`;
const selectedOption = (data: Data, option: Data) =>
  data.selectedOptionId === id(option) ||
  data.requirement?.selectedOptionId === id(option) ||
  data.requirement?.selectedOption?.id === id(option) ||
  data.selected === true;

export function SelectOption({
  eventId,
  eventStatus,
  option,
  selected,
  refresh,
}: {
  eventId: string;
  eventStatus: string;
  option: Data;
  selected: boolean;
  refresh: () => unknown;
}) {
  const action = useAction();
  const reason = selectionReason(eventStatus, option);
  const closed = ["completed", "cancelled"].includes(eventStatus);
  return (
    <View style={{ gap: 9 }}>
      <ErrorNotice message={action.error} />
      {selected && <Pill>SELECTED · NOT RESERVED</Pill>}
      {!!reason && !selected && (
        <Txt muted size={12}>
          {reason}
        </Txt>
      )}
      <Button
        title={
          selected
            ? "Remove from my plan"
            : option.requiresVendorConfirmation
              ? "Request vendor confirmation"
              : "Select for my plan"
        }
        secondary={selected}
        busy={action.busy}
        disabled={closed || (!selected && !!reason)}
        onPress={() =>
          action.run(async () => {
            await external.call(
              `${eventPath(eventId)}/requirements/${encodeURIComponent(option.category)}/select`,
              "POST",
              { optionId: selected ? null : id(option) },
            );
            await refresh();
          })
        }
      />
      {option.requiresVendorConfirmation && (
        <Txt muted size={12}>
          Travel or logistics charges may apply. The vendor must confirm
          coverage and the final total.
        </Txt>
      )}
    </View>
  );
}

export function OptionFacts({ option }: { option: Data }) {
  const availability = optionAvailability(option);
  const rec = option.recommendation || {};
  return (
    <View style={{ gap: 8 }}>
      {option.isDemo && <Pill>DEMO LISTING</Pill>}
      <Txt bold size={22}>
        {option.price == null ? "Price on confirmation" : money(option.price)}
      </Txt>
      <Txt muted>{human(availability)}</Txt>
      {!!option.vendorLocation && <Txt muted>{option.vendorLocation}</Txt>}
      {option.rating != null && (
        <Txt>
          ★ {option.rating} · {option.reviewCount ?? 0} reviews
        </Txt>
      )}
      {option.requiresVendorConfirmation && (
        <Pill>
          {option.extendedService?.label ||
            "EXTENDED SERVICE · CONFIRMATION REQUIRED"}
        </Pill>
      )}
      {rec.auraScore != null && (
        <Card>
          <Txt bold>
            AuraScore {rec.auraScore}/100 · {rec.matchLevel}
          </Txt>
          {!!rec.distance?.distanceText && (
            <Txt muted>
              {rec.distance.distanceText}
              {rec.distance.durationText
                ? ` · ${rec.distance.durationText}`
                : ""}
              {rec.distance.source === "estimate" ? " · estimate" : ""}
            </Txt>
          )}
          {(rec.whyBest || []).map((text: string) => (
            <Txt key={text}>✓ {text}</Txt>
          ))}
          {(rec.whyNot || []).map((text: string) => (
            <Txt muted key={text}>
              Check: {text}
            </Txt>
          ))}
        </Card>
      )}
      {(option.includes || option.inclusions || []).map((text: string) => (
        <Txt key={text}>✓ {text}</Txt>
      ))}
    </View>
  );
}

function AskVendor({ eventId, requirementId, option, navigation }: any) {
  const action = useAction();
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <Card>
      <Txt bold>Ask about this package</Txt>
      <Field
        label="Your question"
        value={question}
        multiline
        maxLength={1500}
        onChangeText={(value) => {
          setQuestion(value);
          setSent(false);
        }}
        editable={!action.busy}
      />
      <ErrorNotice message={action.error} />
      {sent && <Txt>Sent to this service's Event Circle conversation.</Txt>}
      <Button
        title="Send question"
        busy={action.busy}
        disabled={!question.trim()}
        onPress={() =>
          action.run(async () => {
            await external.call(`${eventPath(eventId)}/messages`, "POST", {
              requirementId,
              optionId: id(option),
              body: `${option.vendorName} - ${option.packageName}: ${question.trim()}`,
            });
            setQuestion("");
            setSent(true);
          })
        }
      />
      <Button
        title="Open service conversation"
        secondary
        onPress={() =>
          navigation.navigate("Chat", {
            kind: "circle",
            eventId,
            requirementId,
            title: option.vendorName,
          })
        }
      />
    </Card>
  );
}

export function DiscoveryOptions({ data, eventId, navigation, refresh }: any) {
  const [sort, setSort] = useState("recommended");
  const [selected, setSelected] = useState<string[]>([]);
  const rows = sortOptions(data.options || [], sort);
  return (
    <>
      <Choice
        label="Sort options"
        value={sort}
        values={["recommended", "budget", "premium"]}
        onChange={setSort}
      />
      <Txt muted>
        Choose up to three options to compare. Selecting a vendor does not
        reserve or book them.
      </Txt>
      {selected.length >= 2 && (
        <Button
          title={`Compare ${selected.length} options`}
          onPress={() =>
            navigation.navigate("Compare", { eventId, ids: selected })
          }
        />
      )}
      {rows.map((option) => (
        <Card key={id(option)}>
          {data.bestValueId === id(option) && <Pill>BEST VALUE</Pill>}
          <Txt bold size={23}>
            {option.vendorName}
          </Txt>
          <Txt muted>{option.packageName}</Txt>
          <OptionFacts option={option} />
          <SelectOption
            eventId={eventId}
            eventStatus={data.event?.status}
            option={option}
            selected={selectedOption(data, option)}
            refresh={refresh}
          />
          <Button
            title="View vendor & package"
            secondary
            onPress={() =>
              navigation.navigate("Service", { eventId, optionId: id(option) })
            }
          />
          <Button
            title={
              selected.includes(id(option))
                ? "Remove from comparison"
                : "Add to comparison"
            }
            secondary
            disabled={!selected.includes(id(option)) && selected.length >= 3}
            onPress={() =>
              setSelected((values) => comparisonChoice(values, id(option)))
            }
          />
        </Card>
      ))}
      {!rows.length && (
        <Empty
          title="No options listed yet"
          description="Try another service or ask Aura+ to refine your requirements."
        />
      )}
      {data.selectedOptionId && (
        <Button
          title="Review quotes for your selections"
          secondary
          onPress={() =>
            navigation.navigate("EventSection", {
              eventId,
              section: "quotes",
              title: "Plans & quotes",
            })
          }
        />
      )}
    </>
  );
}

export function ServiceScreen({ route, navigation }: any) {
  const { eventId, optionId } = route.params;
  const r = useResource(
    external,
    `${eventPath(eventId)}/services/${encodeURIComponent(optionId)}`,
  );
  const action = useAction();
  const option = r.data.option || {};
  const profile = r.data.vendorProfile || {};
  const costs = option.costBreakdown;
  const [reviewTab, setReviewTab] = useState("starvnt");
  const open = (url: string) =>
    action.run(async () => {
      if (!/^https?:\/\//i.test(url || ""))
        throw new Error("This media link is unavailable.");
      await Linking.openURL(url);
    });
  return (
    <Page
      {...r}
      title={option.vendorName || "Vendor & package"}
      subtitle={option.packageName}
    >
      <ErrorNotice message={action.error} />
      {profile.isVerified && <Pill>VERIFIED VENDOR</Pill>}
      <OptionFacts option={option} />
      <Txt>{option.description || profile.bio}</Txt>
      <SelectOption
        eventId={eventId}
        eventStatus={r.data.event?.status}
        option={option}
        selected={selectedOption(r.data, option)}
        refresh={r.refresh}
      />
      <Button
        title="Save to favorites"
        secondary
        busy={action.busy}
        onPress={() =>
          action.run(async () => {
            await external.call("/customer/favorites", "POST", {
              eventId,
              optionId,
              vendorId: option.vendorId,
              vendorName: option.vendorName,
              category: option.category,
              packageName: option.packageName,
              price: option.price,
            });
          })
        }
      />
      {costs && (
        <Card>
          <Txt bold size={20}>
            Price breakdown
          </Txt>
          {[
            ["base", "Base"],
            ["travel", "Travel"],
            ["additional", "Additional"],
          ].map(([key, label]) => (
            <Txt key={key}>
              {label}: {money(costs[key])}
            </Txt>
          ))}
          <Txt bold>Total: {money(option.price)}</Txt>
        </Card>
      )}
      {!!option.cancellationPolicy && (
        <Card>
          <Txt bold>Cancellation policy</Txt>
          <Txt>{option.cancellationPolicy}</Txt>
        </Card>
      )}
      {!!option.mayApply?.length && (
        <Card>
          <Txt bold>May apply</Txt>
          {option.mayApply.map((text: string) => (
            <Txt key={text}>{text}</Txt>
          ))}
        </Card>
      )}
      <AskVendor
        eventId={eventId}
        requirementId={id(r.data.requirement || {}) || option.category}
        option={option}
        navigation={navigation}
      />
      <Txt bold size={21}>
        Portfolio
      </Txt>
      {(r.data.portfolio || []).map((media: Data, index: number) => (
        <Card key={id(media) || index}>
          {media.mediaType === "IMAGE" &&
            /^https?:\/\//i.test(media.thumbnailUrl || media.url || "") && (
              <Image
                source={{ uri: media.thumbnailUrl || media.url }}
                style={{ width: "100%", height: 220, borderRadius: 16 }}
                resizeMode="cover"
                accessibilityLabel={media.title || "Vendor portfolio"}
              />
            )}
          <Txt bold>
            {media.title ||
              media.projectName ||
              human(media.mediaType || "Portfolio item")}
          </Txt>
          {!!media.description && <Txt>{media.description}</Txt>}
          <Button
            title={media.mediaType === "IMAGE" ? "Open photo" : "Open media"}
            secondary
            onPress={() => open(media.url || media.mediaUrl)}
          />
        </Card>
      ))}
      {!r.data.portfolio?.length && <Txt muted>No portfolio items listed.</Txt>}
      {!!r.data.capabilities?.length && (
        <Card>
          <Txt bold size={20}>
            Capabilities & equipment
          </Txt>
          {r.data.capabilities.map((cap: Data, index: number) => (
            <View key={id(cap) || index} style={{ gap: 5 }}>
              <Txt>
                {[...(cap.styles || []), ...(cap.equipment || [])].join(" · ")}
              </Txt>
              {cap.format && <Txt>Format: {cap.format}</Txt>}
              {cap.teamSize != null && <Txt>Team size: {cap.teamSize}</Txt>}
              {cap.simultaneousEventLimit != null && (
                <Txt>Simultaneous events: {cap.simultaneousEventLimit}</Txt>
              )}
            </View>
          ))}
        </Card>
      )}
      {!!r.data.resources?.length && (
        <Card>
          <Txt bold size={20}>
            Team & resources
          </Txt>
          {r.data.resources.map((resource: Data) => (
            <Txt key={id(resource)}>
              {resource.name} · {human(resource.type)}
              {resource.capacityUnits != null
                ? ` · capacity ${resource.capacityUnits}`
                : ""}
            </Txt>
          ))}
        </Card>
      )}
      {!!r.data.locations?.length && (
        <Card>
          <Txt bold size={20}>
            Operating locations
          </Txt>
          {r.data.locations.map((location: Data) => (
            <View key={id(location)} style={{ gap: 5 }}>
              {location.isPrimary && <Pill>PRIMARY</Pill>}
              <Txt bold>{location.label}</Txt>
              <Txt>
                {[
                  location.address,
                  location.locality,
                  location.city,
                  location.state,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Txt>
            </View>
          ))}
        </Card>
      )}
      {r.data.travelPolicy && (
        <Card>
          <Txt bold size={20}>
            Travel policy
          </Txt>
          {[
            ["freeRadiusKm", "Free radius (km)"],
            ["perKmRate", "Per extra km (₹)"],
            ["equipmentTransitFee", "Equipment transit (₹)"],
            ["outstationDailyAllowance", "Outstation daily allowance (₹)"],
            ["accommodationRequiredBeyondKm", "Accommodation beyond (km)"],
          ].map(
            ([key, label]) =>
              r.data.travelPolicy[key] != null && (
                <Txt key={key}>
                  {label}: {r.data.travelPolicy[key]}
                </Txt>
              ),
          )}
          <Txt>
            Tolls & parking:{" "}
            {r.data.travelPolicy.tollAndParkingIncluded
              ? "Included"
              : "Not included"}
          </Txt>
        </Card>
      )}
      {profile.workingHours && (
        <Card>
          <Txt bold size={20}>
            Working hours
          </Txt>
          {Object.entries(profile.workingHours).map(
            ([day, hours]: [string, any]) => (
              <Txt key={day}>
                {human(day)}:{" "}
                {hours.isOpen
                  ? hours.hours || "Contact vendor for hours"
                  : "Closed"}
              </Txt>
            ),
          )}
        </Card>
      )}
      <Choice
        label="Reviews"
        values={["starvnt", "google"]}
        value={reviewTab}
        onChange={setReviewTab}
      />
      {reviewTab === "google" && (
        <>
          <Txt bold>
            Google rating:{" "}
            {r.data.googleRating?.rating != null
              ? `${r.data.googleRating.rating} / 5`
              : "Not listed"}
          </Txt>
          {(r.data.googleRating?.reviews || []).map(
            (review: Data, index: number) => (
              <Card key={index}>
                <Txt bold>
                  {reviewerName(review)} · {review.rating} / 5
                </Txt>
                <Txt>{reviewText(review)}</Txt>
              </Card>
            ),
          )}
        </>
      )}
      {reviewTab === "starvnt" && (
        <>
          {(r.data.reviews || []).map((review: Data, index: number) => (
            <Card key={id(review) || index}>
              <Txt bold>{review.rating} / 5</Txt>
              <Txt>{reviewText(review)}</Txt>
              {review.vendorReply?.text && (
                <Txt muted>Vendor reply: {review.vendorReply.text}</Txt>
              )}
            </Card>
          ))}
          {!r.data.reviews?.length && <Txt muted>No STARVNT reviews yet.</Txt>}
        </>
      )}
    </Page>
  );
}

export function CompareScreen({ route, navigation }: any) {
  const { eventId, ids } = route.params;
  const r = useResource(
    external,
    `${eventPath(eventId)}/services/compare?ids=${ids.map(encodeURIComponent).join(",")}`,
  );
  const palette = usePalette();
  const options: Data[] = r.data.options || [];
  const rows: [string, (option: Data) => string][] = [
    ["Package", (o) => o.packageName || "Not specified"],
    ["Price", (o) => (o.price == null ? "On confirmation" : money(o.price))],
    ["Availability", (o) => human(optionAvailability(o))],
    [
      "Coverage",
      (o) =>
        o.requiresVendorConfirmation
          ? "Vendor confirmation required"
          : "Within configured coverage",
    ],
    [
      "Travel",
      (o) =>
        o.costBreakdown?.travel == null
          ? "Not specified"
          : o.costBreakdown.travel === 0
            ? "Included"
            : money(o.costBreakdown.travel),
    ],
    [
      "Includes",
      (o) => (o.includes || o.inclusions || []).join(", ") || "Not specified",
    ],
    [
      "Rating",
      (o) =>
        o.rating == null
          ? "No rating yet"
          : `${o.rating} / 5 · ${o.reviewCount || 0} reviews`,
    ],
    ["Summary", (o) => o.summary || "Not specified"],
  ];
  return (
    <Page
      {...r}
      title="Compare your options"
      subtitle="Swipe across to compare the same details for each vendor."
    >
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ gap: 0 }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 105 }} />
            {options.map((o) => (
              <View key={id(o)} style={{ width: 205, padding: 12, gap: 8 }}>
                <Txt bold size={20}>
                  {o.vendorName}
                </Txt>
                {o.isDemo && <Pill>DEMO</Pill>}
              </View>
            ))}
          </View>
          {rows.map(([label, render]) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <View style={{ width: 105, paddingVertical: 12 }}>
                <Txt muted bold>
                  {label}
                </Txt>
              </View>
              {options.map((o) => (
                <View key={id(o)} style={{ width: 205, padding: 12 }}>
                  <Txt>{render(o)}</Txt>
                </View>
              ))}
            </View>
          ))}
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 105 }} />
            {options.map((o) => (
              <View key={id(o)} style={{ width: 205, padding: 12, gap: 12 }}>
                <SelectOption
                  eventId={eventId}
                  eventStatus={r.data.event?.status}
                  option={o}
                  selected={selectedOption(r.data, o)}
                  refresh={r.refresh}
                />
                <Button
                  title="View details"
                  secondary
                  onPress={() =>
                    navigation.navigate("Service", { eventId, optionId: id(o) })
                  }
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {!options.length && (
        <Empty
          title="No comparison options"
          description="Choose two or three options from the same service."
        />
      )}
      <Button
        title="Ask Aura+ to compare these vendors"
        secondary
        disabled={!options.length}
        onPress={() =>
          navigation.navigate("Chat", {
            eventId,
            initialPrompt: `Why pick one ${r.data.label || "service"} option over the other: ${options.map((o) => o.vendorName).join(" vs ")}?`,
          })
        }
      />
    </Page>
  );
}
