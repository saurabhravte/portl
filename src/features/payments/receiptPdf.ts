import { buildReceiptHtml, type ReceiptData } from "@/features/payments/receipt";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";

export async function downloadReceiptPdf(receipt: ReceiptData): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({
      html: buildReceiptHtml(receipt),
      base64: false,
    });
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Download PDF Receipt",
        UTI: "com.adobe.pdf",
      });
      return;
    }
    if (Platform.OS === "web") {
      Alert.alert(
        "Receipt ready",
        "Use your browser print dialog to save the PDF.",
      );
      await Print.printAsync({ html: buildReceiptHtml(receipt) });
      return;
    }
    Alert.alert(
      "Sharing unavailable",
      "Could not open the share sheet on this device.",
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Please try again.";
    Alert.alert("Couldn’t create PDF", message);
  }
}
