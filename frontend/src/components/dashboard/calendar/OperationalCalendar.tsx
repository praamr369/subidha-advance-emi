import React, { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, parseISO, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Info } from "lucide-react";
import { getDashboardCalendarEvents, CalendarEventPayload } from "@/services/dashboard-calendar";
import ActionButton from "@/components/ui/ActionButton";
import Link from "next/link";
import { MemoSetupDialog } from "./MemoSetupDialog";
import { cn } from "@/lib/utils";

export function OperationalCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEventPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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
      default: return "bg-slate-500";
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case "red": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400";
      case "orange": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400";
      case "blue": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
      case "emerald": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
      default: return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400";
    }
  };

  const selectedDayEvents = events.filter(e => isSameDay(parseISO(e.date), selectedDate));
  
  // Calculate padding days to ensure 7 columns
  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const emptyDays = Array.from({ length: firstDayOfMonth });

  return (
    <div className="rounded-[1.5rem] border border-border bg-card text-card-foreground shadow-sm bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Calendar</h2>
        </div>
        <ActionButton variant="outline" size="sm" className="h-7 px-2" onClick={openAddMemo}>
          <Plus className="h-3 w-3 mr-1" />
          <span className="text-xs">Memo</span>
        </ActionButton>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="text-sm font-bold">
            {format(currentMonth, "MMMM yyyy")}
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setCurrentMonth(new Date())}
              className="px-2 py-1 text-xs font-medium rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Today
            </button>
            <button 
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid flex-1 place-items-center min-h-[250px]">
            <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          </div>
        ) : (
          <div className="flex-1">
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <div key={day} className="text-[10px] font-semibold text-muted-foreground uppercase">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-y-2 gap-x-1 justify-items-center">
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
                      "relative flex flex-col items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-all",
                      isSelected 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : isCurrentToday 
                          ? "bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700" 
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                      !isSameMonth(day, currentMonth) && !isSelected && !isCurrentToday && "text-slate-400 dark:text-slate-600"
                    )}
                  >
                    <span>{format(day, "d")}</span>
                    
                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-1 flex gap-0.5 justify-center w-full">
                        {dayEvents.slice(0, 3).map((ev, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "w-1 h-1 rounded-full",
                              isSelected ? "bg-primary-foreground/70" : getDotColor(ev.color)
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

        {/* Selected Day Details Section */}
        <div className="mt-6 pt-4 border-t border-border flex-1 flex flex-col min-h-[200px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d, yyyy")}
            </h3>
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium text-muted-foreground">
              {selectedDayEvents.length} Event{selectedDayEvents.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 max-h-[300px]">
            {selectedDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-70 py-8">
                <Info className="h-6 w-6 mb-2" />
                <span className="text-xs">No scheduled events</span>
              </div>
            ) : (
              selectedDayEvents.map(ev => (
                <Link 
                  key={ev.id} 
                  href={ev.href}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-sm",
                    getColorClasses(ev.color)
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs leading-tight">{ev.title}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] uppercase font-bold tracking-widest opacity-80">
                      {ev.source_type}
                    </span>
                    {ev.customer_name && (
                      <span className="text-[10px] opacity-90 truncate max-w-[120px] font-medium">
                        {ev.customer_name}
                      </span>
                    )}
                  </div>
                </Link>
              ))
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
