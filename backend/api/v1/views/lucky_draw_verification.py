import hashlib
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from subscriptions.models import LuckyDraw


class LuckyDrawVerificationView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, draw_id):
        try:
            draw = LuckyDraw.objects.get(pk=draw_id)
        except LuckyDraw.DoesNotExist:
            return Response({"error": "Draw not found"}, status=404)

        if not draw.revealed_seed:
            return Response({"status": "Not revealed yet"})

        recalculated_hash = hashlib.sha256(
            draw.revealed_seed.encode()
        ).hexdigest()

        return Response({
            "batch_id": draw.batch_id,
            "committed_hash": draw.committed_hash,
            "revealed_seed": draw.revealed_seed,
            "hash_matches": recalculated_hash == draw.committed_hash,
            "winner_lucky_id": draw.winner_lucky_id_id,
        })