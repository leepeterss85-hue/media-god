import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Captions,
  Check,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";

import { cn } from "@/lib/utils";

const HIDE_DELAY_MS =
  3000;

const formatTime = (
  seconds
) => {
  if (
    !seconds ||
    !Number.isFinite(
      seconds
    )
  ) {
    return "0:00";
  }

  const s =
    Math.floor(
      seconds %
        60
    );

  const m =
    Math.floor(
      (
        seconds /
        60
      ) %
        60
    );

  const h =
    Math.floor(
      seconds /
        3600
    );

  if (
    h >
    0
  ) {
    return `${h}:${String(
      m
    ).padStart(
      2,
      "0"
    )}:${String(
      s
    ).padStart(
      2,
      "0"
    )}`;
  }

  return `${m}:${String(
    s
  ).padStart(
    2,
    "0"
  )}`;
};

const normaliseLanguage =
  (
    value
  ) =>
    String(
      value ||
        ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /_/g,
        "-"
      );

const friendlyLanguage =
  (
    value
  ) => {
    const language =
      normaliseLanguage(
        value
      );

    const names = {
      en:
        "English",

      eng:
        "English",

      "en-gb":
        "English (UK)",

      "en-us":
        "English (US)",

      es:
        "Spanish",

      spa:
        "Spanish",

      fr:
        "French",

      fra:
        "French",

      fre:
        "French",

      de:
        "German",

      deu:
        "German",

      ger:
        "German",

      it:
        "Italian",

      ita:
        "Italian",

      pt:
        "Portuguese",

      por:
        "Portuguese",

      nl:
        "Dutch",

      nld:
        "Dutch",

      dut:
        "Dutch",

      pl:
        "Polish",

      pol:
        "Polish",

      sv:
        "Swedish",

      swe:
        "Swedish",

      da:
        "Danish",

      dan:
        "Danish",

      no:
        "Norwegian",

      nor:
        "Norwegian",

     
