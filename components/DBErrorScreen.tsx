// components/DbErrorScreen.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import * as Updates from "expo-updates";

interface DbErrorScreenProps {
  error: Error;
}

export function DbErrorScreen({ error }: DbErrorScreenProps) {
  const handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // expo-updates not available (e.g. dev build) — nothing else to do here
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Database Setup Failed</Text>
        <Text style={styles.message}>
          PoultryScale couldn't set up its local database. Your existing data
          is safe — this is a setup issue, not data loss. Restarting the app
          usually fixes this.
        </Text>

        <Pressable style={styles.button} onPress={handleRestart}>
          <Text style={styles.buttonText}>Restart App</Text>
        </Pressable>

        <ScrollView style={styles.errorBox} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.errorLabel}>Technical details:</Text>
          <Text style={styles.errorText}>{error.message}</Text>
          {error.stack ? (
            <Text style={styles.errorStack}>{error.stack}</Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#aaaaaa",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 24,
  },
  buttonText: {
    color: "#000000",
    fontWeight: "600",
    fontSize: 15,
  },
  errorBox: {
    width: "100%",
    maxHeight: 200,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333333",
  },
  errorLabel: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 6,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 12,
    color: "#ff6b6b",
    fontFamily: "monospace",
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: "#666666",
    fontFamily: "monospace",
  },
});