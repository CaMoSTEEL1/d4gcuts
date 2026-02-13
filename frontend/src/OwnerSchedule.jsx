import { useEffect, useMemo, useState, useCallback } from "react";
import "./App.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const toDateInput = (date) => date.toISOString().slice(0, 10);

const startOfWeek = (date = new Date()) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const clone = new Date(date);
  clone.setDate(date.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const addDays = (date, days) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const formatLabelDate = (dateText) =>
  new Date(`${dateText}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatTimeEST = (time24) => {
  const [h = "0", m = "0"] = String(time24 || "00:00").split(":");
  const hour = Number(h);
  const minute = Number(m);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix} EST`;
};

const defaultDraft = {
  date: toDateInput(new Date()),
  start_time: "10:00",
  end_time: "11:00",
  is_open: true,
};

const defaultRecurring = {
  from: toDateInput(new Date()),
  to: toDateInput(addDays(new Date(), 14)),
  start_time: "10:00",
  end_time: "18:00",
  interval_minutes: 60,
  weekdays: [1, 2, 3, 4, 5],
  is_open: true,
};

const safeFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
};

export default function OwnerSchedule() {
  const [slots, setSlots] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [statusFilter, setStatusFilter] = useState("all");
  const [slotDraft, setSlotDraft] = useState(defaultDraft);
  const [editingId, setEditingId] = useState(null);
  const [recurring, setRecurring] = useState(defaultRecurring);

  const token = localStorage.getItem("token") || "";
  const user = useMemo(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const fetchSlots = useCallback(async () => {
    if (!token || user?.role !== "OWNER") {
      setStatus("Owner login required.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const from = toDateInput(weekStart);
      const to = toDateInput(weekEnd);
      const res = await safeFetch(
        `${API_BASE}/availability/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: authHeaders }
      );
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || "Failed to load schedule");
        return;
      }
      setSlots(data);
    } catch (err) {
      setStatus(err.message || "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [token, user?.role, weekStart, weekEnd, authHeaders]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const filteredSlots = useMemo(() => {
    if (statusFilter === "open") return slots.filter((slot) => slot.is_open === 1);
    if (statusFilter === "closed") return slots.filter((slot) => slot.is_open === 0);
    if (statusFilter === "booked") return slots.filter((slot) => Number(slot.is_booked) === 1);
    return slots;
  }, [slots, statusFilter]);

  const groupedSlots = useMemo(() => {
    const groups = {};
    for (const slot of filteredSlots) {
      if (!groups[slot.date]) groups[slot.date] = [];
      groups[slot.date].push(slot);
    }
    return groups;
  }, [filteredSlots]);

  const clearDraft = () => {
    setEditingId(null);
    setSlotDraft(defaultDraft);
  };

  const handleCreateOrUpdate = async () => {
    if (!token || user?.role !== "OWNER") {
      setStatus("Owner login required.");
      return;
    }

    const isEditing = Boolean(editingId);
    const endpoint = isEditing
      ? `${API_BASE}/availability/${editingId}`
      : `${API_BASE}/availability`;
    const method = isEditing ? "PUT" : "POST";

    try {
      const res = await safeFetch(endpoint, {
        method,
        headers: authHeaders,
        body: JSON.stringify(slotDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || "Failed to save slot");
        return;
      }

      setStatus(isEditing ? "Slot updated." : "Slot created.");
      clearDraft();
      fetchSlots();
    } catch (err) {
      setStatus(err.message || "Failed to save slot");
    }
  };

  const handleDelete = async (slotId) => {
    try {
      const res = await safeFetch(`${API_BASE}/availability/${slotId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || "Failed to delete slot");
        return;
      }
      setStatus("Slot deleted.");
      fetchSlots();
    } catch (err) {
      setStatus(err.message || "Failed to delete slot");
    }
  };

  const handleToggle = async (slot) => {
    try {
      const res = await safeFetch(`${API_BASE}/availability/${slot.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ is_open: !slot.is_open }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || "Failed to update slot status");
        return;
      }
      setStatus("Slot status updated.");
      fetchSlots();
    } catch (err) {
      setStatus(err.message || "Failed to update slot status");
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await safeFetch(`${API_BASE}/availability/generate`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ...recurring,
          interval_minutes: Number(recurring.interval_minutes),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || "Failed to generate recurring slots");
        return;
      }
      setStatus(`Generated ${data.generated} slots (${data.inserted} inserted).`);
      fetchSlots();
    } catch (err) {
      setStatus(err.message || "Failed to generate recurring slots");
    }
  };

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart]
  );

  return (
    <div className="page owner-page">
      <header className="owner-hero">
        <h1>Owner Schedule</h1>
        <p>Manage weekly availability, create slots, and generate recurring schedules.</p>
        <a className="ghost" href="/">
          Back to site
        </a>
      </header>

      <section className="section owner" id="owner">
        <div className="owner-panel">

          {/* ── Week Navigation ── */}
          <div className="owner-week-nav">
            <div className="owner-week-btns">
              <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                Prev
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                Next
              </Button>
            </div>
            <div className="owner-week-filter">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <SelectOption value="all">All Slots</SelectOption>
                <SelectOption value="open">Open Only</SelectOption>
                <SelectOption value="closed">Closed Only</SelectOption>
                <SelectOption value="booked">Booked Only</SelectOption>
              </Select>
              <Button variant="ghost" size="sm" onClick={fetchSlots}>
                Refresh
              </Button>
            </div>
          </div>

          <p className="muted owner-week-label">
            {toDateInput(weekStart)} &mdash; {toDateInput(weekEnd)}{" "}
            {loading ? "\u00b7 Loading..." : ""}
          </p>

          {/* ── Create / Edit Slot ── */}
          <div className="owner-card">
            <h3 className="owner-card-title">
              {editingId ? "Edit Slot" : "Create Slot"}
            </h3>
            <div className="owner-form-grid">
              <div className="owner-field">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={slotDraft.date}
                  onChange={(e) => setSlotDraft({ ...slotDraft, date: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>Start</Label>
                <Input
                  type="time"
                  value={slotDraft.start_time}
                  onChange={(e) => setSlotDraft({ ...slotDraft, start_time: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>End</Label>
                <Input
                  type="time"
                  value={slotDraft.end_time}
                  onChange={(e) => setSlotDraft({ ...slotDraft, end_time: e.target.value })}
                />
              </div>
              <div className="owner-field owner-field-switch">
                <Switch
                  checked={slotDraft.is_open}
                  onCheckedChange={(val) => setSlotDraft({ ...slotDraft, is_open: val })}
                  label="Open"
                />
              </div>
            </div>
            <div className="owner-form-actions">
              <Button onClick={handleCreateOrUpdate}>
                {editingId ? "Update Slot" : "Create Slot"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={clearDraft}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* ── Recurring Generator ── */}
          <div className="owner-card">
            <h3 className="owner-card-title">Recurring Generator</h3>
            <div className="owner-form-grid">
              <div className="owner-field">
                <Label>From</Label>
                <Input
                  type="date"
                  value={recurring.from}
                  onChange={(e) => setRecurring({ ...recurring, from: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>To</Label>
                <Input
                  type="date"
                  value={recurring.to}
                  onChange={(e) => setRecurring({ ...recurring, to: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>Start</Label>
                <Input
                  type="time"
                  value={recurring.start_time}
                  onChange={(e) => setRecurring({ ...recurring, start_time: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>End</Label>
                <Input
                  type="time"
                  value={recurring.end_time}
                  onChange={(e) => setRecurring({ ...recurring, end_time: e.target.value })}
                />
              </div>
              <div className="owner-field">
                <Label>Interval (min)</Label>
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={recurring.interval_minutes}
                  onChange={(e) =>
                    setRecurring({ ...recurring, interval_minutes: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="owner-days-row">
              {[
                { n: "S", v: 0 },
                { n: "M", v: 1 },
                { n: "T", v: 2 },
                { n: "W", v: 3 },
                { n: "T", v: 4 },
                { n: "F", v: 5 },
                { n: "S", v: 6 },
              ].map((day) => {
                const active = recurring.weekdays.includes(day.v);
                return (
                  <button
                    key={day.v}
                    type="button"
                    className={`owner-day-btn ${active ? "active" : ""}`}
                    onClick={() => {
                      const next = active
                        ? recurring.weekdays.filter((w) => w !== day.v)
                        : [...recurring.weekdays, day.v].sort();
                      setRecurring({ ...recurring, weekdays: next });
                    }}
                  >
                    {day.n}
                  </button>
                );
              })}
            </div>

            <div className="owner-form-actions">
              <Switch
                checked={recurring.is_open}
                onCheckedChange={(val) => setRecurring({ ...recurring, is_open: val })}
                label="Generated slots open"
              />
              <Button onClick={handleGenerate}>Generate</Button>
            </div>
          </div>

          {status && <p className="status">{status}</p>}

          {/* ── Day-by-day slot list ── */}
          {weekDays.map((day) => {
            const key = toDateInput(day);
            const daySlots = groupedSlots[key] || [];
            return (
              <div key={key} className="owner-day-panel">
                <h3 className="owner-day-heading">{formatLabelDate(key)}</h3>
                {daySlots.length === 0 ? (
                  <p className="muted">No slots</p>
                ) : (
                  <div className="owner-day-slots">
                    {daySlots.map((slot) => (
                      <div key={slot.id} className="owner-slot-card">
                        <div className="owner-slot-info">
                          <span className="owner-slot-time">
                            {formatTimeEST(slot.start_time)} &ndash; {formatTimeEST(slot.end_time)}
                          </span>
                          <div className="owner-slot-badges">
                            <span className={`owner-slot-badge ${slot.is_open ? "open" : "closed"}`}>
                              {slot.is_open ? "Open" : "Closed"}
                            </span>
                            {Number(slot.is_booked) === 1 && (
                              <span className="owner-slot-badge booked">Booked</span>
                            )}
                          </div>
                        </div>
                        <div className="owner-slot-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingId(slot.id);
                              setSlotDraft({
                                date: slot.date,
                                start_time: slot.start_time,
                                end_time: slot.end_time,
                                is_open: Boolean(slot.is_open),
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleToggle(slot)}>
                            {slot.is_open ? "Close" : "Open"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(slot.id)}
                            disabled={Number(slot.is_booked) === 1}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
