import React, { useMemo, useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, parseISO, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Info } from "lucide-react";
import { getDashboardCalendarEvents, CalendarEventPayload } from "@/services/dashboard-calendar";
import ActionButton from "@/components/ui/ActionButton";
import Link from "next/link";
import { MemoSetupDialog } from "./MemoSetupDialog";
import { cn } from "@/lib/utils";

type CalendarFilterKey = "ALL" | "SALE" | "PURCHASE" | "PAYMENT" | "STAFF" | "STOCK" | "DUE";

const FILTER_TABS: Array<{ key: CalendarFilterKey; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "SALE", label: "Sales" },
  { key: "PURCHASE", label: "Purchase" },
  { key: "PAYMENT", label: "Payments" },
  { key: "STAFF", label: "Staff" },
  { key: "STOCK", label: "Stock" },
  { key: "DUE", label: "Due" },
];

function matchesFilter(ev: CalendarEventPayload, filter: CalendarFilterKey): boolean {
  if (filter === "ALL") return true;
  const st = (ev.source_type || "").toUpperCase();
  switch (filter) {
    case "SALE":
      return st === "SALE" || st === "DIRECT_SALE";
    case "PURCHASE":
      return st === "PURCHASE" || st === "VENDOR_PAYMENT";
    case "PAYMENT":
      return st === "PAYMENT_IN" || st === "VENDOR_PAYMENT" || st === "EXPENSE";
    case "STAFF":
      return st === "STAFF_PAYMENT";
    case "STOCK":
      return st === "STOCK";
    case "DUE":
      return st === "EMI_DUE" || st === "RENT_DUE" || st === "SUBSCRIPTION_EMI";
    default:
      return true;
  }
}

export function OperationalCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEventPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeFilter, setActiveFilter] = useState<CalendarFilterKey>("ALL");

  const fetchEvents = async (date: Date) => {
    setLoading(true);
    try {
      const monthStr = format(date, "yyyy-MM");
      const res = await getDashboardCalendarEvents(monthStr);
      setEvents(res.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(currentMonth);
  }, [currentMonth]);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const openAddMemo = () => {
    setMemoDialogOpen(true);
  };

  const getDotColor = (color: string) => {
    switch (color) {
      case "red": return "bg-red-500";
      case "orange": return "bg-orange-500";
      case "blue": return "bg-blue-500";
      case "emerald": return "bg-emerald-500";
      case "purple": return "bg-purple-500";
      default: return "bg-slate-500";
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case "red": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60";
      case "orange": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60";
      case "blue": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60";
      case "emerald": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60";
      case "purple": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60";
      default: return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-muted dark:text-foreground dark:border-border";
    }
  };

  const selectedDayAllEvents = useMemo(
    () => events.filter((e) => isSameDay(parseISO(e.date), selectedDate)),
    [events, selectedDate]
  );

  const selectedDayEvents = useMemo(
    () => selectedDayAllEvents.filter((e) => matchesFilter(e, activeFilter)),
    [selectedDayAllEvents, activeFilter]
  );

  // Calculate padding days to ensure 7 columns
  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const emptyDays = Array.from({ length: firstDayOfMonth });

  return (
    <div className="rounded-[1.5rem] border border-border bg-card text-card-foreground shadow-sm flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Calendar</h2>
        </div>
        <ActionButton variant="outline" size="sm" className="h-7 px-2" onClick={openAddMemo}>
          <Plus className="h-3 w-3 mr-1" />
          <span className="text-xs">Memo</span>
        </ActionButton>
      </div>

      <div className="p-4 flex flex-col">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-sm font-bold">
            {format(currentMonth, "MMMM yyyy")}
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous month"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentMonth(now);
                setSelectedDate(now);
              }}
              className="px-2 py-1 text-xs font-medium rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              aria-label="Next month"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center min-h-[220px]">
            <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <div key={day} className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1.5 gap-x-1 justify-items-center">
              {emptyDays.map((_, i) => (
                <div key={`empty-${i}`} className="w-8 h-8" />
              ))}

              {daysInMonth.map((day, i) => {
                const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentToday = isToday(day);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "relative flex flex-col items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : isCurrentToday
                          ? "bg-muted text-foreground ring-1 ring-inset ring-primary/50 hover:bg-muted/80"
                          : "text-foreground/85 hover:bg-muted",
                      !isSameMonth(day, currentMonth) && !isSelected && !isCurrentToday && "text-muted-foreground/50"
                    )}
                  >
                    <span>{format(day, "d")}</span>

                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-0.5 flex gap-0.5 justify-center w-full">
                        {dayEvents.slice(0, 3).map((ev, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "w-1 h-1 rounded-full",
                              isSelected ? "bg-primary-foreground/80" : getDotColor(ev.color)
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Day Details Section — directly below the calendar grid */}
        <div className="mt-4 pt-3 border-t border-border flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d, yyyy")}
            </h3>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium text-muted-foreground">
              {selectedDayEvents.length} {activeFilter === "ALL" ? "Event" : FILTER_TABS.find((t) => t.key === activeFilter)?.label}{selectedDayEvents.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Quick category filters */}
          {selectedDayAllEvents.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {FILTER_TABS.map((tab) => {
                const count = selectedDayAllEvents.filter((e) => matchesFilter(e, tab.key)).length;
                if (tab.key !== "ALL" && count === 0) return null;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveFilter(tab.key)}
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-[10px] font-semibold transition cursor-pointer border",
                      activeFilter === tab.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/60 text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-y-auto pr-1 flex flex-col gap-2 max-h-[380px]">
            {selectedDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground opacity-70 py-6">
                <Info className="h-5 w-5 mb-1.5" />
                <span className="text-xs">No transactions or events on this date</span>
              </div>
            ) : (
              selectedDayEvents.map((ev) => {
                const cardBody = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs leading-snug">{ev.title}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <span className="text-[9px] uppercase font-bold tracking-widest opacity-80">
                        {ev.source_type.replace(/_/g, " ")}
                      </span>
                      {ev.customer_name && (
                        <span className="text-[10px] opacity-90 truncate max-w-[140px] font-medium">
                          {ev.customer_name}
                        </span>
                      )}
                    </div>
                  </>
                );

                return ev.href ? (
                  <Link
                    key={ev.id}
                    href={ev.href}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-sm",
                      getColorClasses(ev.color)
                    )}
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <div
                    key={ev.id}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-xl border px-3 py-2",
                      getColorClasses(ev.color)
                    )}
                  >
                    {cardBody}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <MemoSetupDialog
        open={memoDialogOpen}
        onOpenChange={setMemoDialogOpen}
        defaultDate={selectedDate}
        onSuccess={() => fetchEvents(currentMonth)}
      />
    </div>
  );
}
