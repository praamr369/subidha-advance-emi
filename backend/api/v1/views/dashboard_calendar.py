import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from subscriptions.services.dashboard_calendar_service import fetch_dashboard_calendar_events
from system_jobs.models import DashboardMemo

class DashboardCalendarEventsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        month = request.query_params.get("month")
        if not month:
            today = datetime.date.today()
            start_date = today.replace(day=1)
        else:
            try:
                start_date = datetime.datetime.strptime(month, "%Y-%m").date()
            except ValueError:
                return Response({"error": "Invalid month format. Use YYYY-MM"}, status=status.HTTP_400_BAD_REQUEST)
        
        # Calculate end_date (last day of the month)
        next_month = start_date.replace(day=28) + datetime.timedelta(days=4)
        end_date = next_month - datetime.timedelta(days=next_month.day)

        # To support a full calendar grid, maybe expand by a week on each side
        start_date = start_date - datetime.timedelta(days=7)
        end_date = end_date + datetime.timedelta(days=7)

        events = fetch_dashboard_calendar_events(start_date, end_date, request.user)
        return Response({"events": events})

class DashboardMemoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        date_str = request.data.get("date")
        title = request.data.get("title")
        description = request.data.get("description", "")
        color_code = request.data.get("color_code", "slate")

        if not date_str or not title:
            return Response({"error": "date and title are required"}, status=status.HTTP_400_BAD_REQUEST)

        memo = DashboardMemo.objects.create(
            user=request.user,
            date=date_str,
            title=title,
            description=description,
            color_code=color_code
        )
        return Response({"id": memo.id, "status": "success"}, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        try:
            memo = DashboardMemo.objects.get(pk=pk, user=request.user)
            memo.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DashboardMemo.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
