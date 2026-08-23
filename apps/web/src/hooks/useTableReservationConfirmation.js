import apiServerClient from '@/lib/apiServerClient';

export function useTableReservationConfirmation() {
  const sendConfirmationEmail = async (reservationData) => {
    try {
      const response = await apiServerClient.fetch('/reservations/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationId: reservationData.id,
          customerEmail: reservationData.email,
          customerPhone: reservationData.phone,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to send confirmation';
        try {
          const errData = await response.json();
          errorMessage = errData.error || errData.message || errorMessage;
        } catch (e) {
          // Fallback if not JSON
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('Confirmation error:', error);
      throw error;
    }
  };

  return { sendConfirmationEmail };
}