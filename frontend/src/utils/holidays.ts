// 日本の祝日を計算するユーティリティ

// 春分の日を計算（1900-2099年用）
const getVernalEquinoxDay = (year: number): number => {
  if (year >= 1900 && year <= 1979) {
    return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  } else if (year >= 1980 && year <= 2099) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
  return 21; // デフォルト
};

// 秋分の日を計算（1900-2099年用）
const getAutumnalEquinoxDay = (year: number): number => {
  if (year >= 1900 && year <= 1979) {
    return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  } else if (year >= 1980 && year <= 2099) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }
  return 23; // デフォルト
};

// 第n月曜日を取得
const getNthMonday = (year: number, month: number, n: number): number => {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();
  const firstMonday = firstDayOfWeek <= 1 ? 1 + (1 - firstDayOfWeek) : 1 + (8 - firstDayOfWeek);
  return firstMonday + (n - 1) * 7;
};

// 指定された年月の祝日を取得
export const getHolidaysForMonth = (year: number, month: number): Map<number, string> => {
  const holidays = new Map<number, string>();

  // 固定祝日
  const fixedHolidays: { [key: string]: { day: number; name: string }[] } = {
    '1': [
      { day: 1, name: '元日' },
      { day: 11, name: '建国記念の日' },
    ],
    '2': [
      { day: 11, name: '建国記念の日' },
      { day: 23, name: '天皇誕生日' },
    ],
    '4': [
      { day: 29, name: '昭和の日' },
    ],
    '5': [
      { day: 3, name: '憲法記念日' },
      { day: 4, name: 'みどりの日' },
      { day: 5, name: 'こどもの日' },
    ],
    '8': [
      { day: 11, name: '山の日' },
    ],
    '11': [
      { day: 3, name: '文化の日' },
      { day: 23, name: '勤労感謝の日' },
    ],
  };

  // 固定祝日を追加
  const monthKey = String(month);
  if (fixedHolidays[monthKey]) {
    fixedHolidays[monthKey].forEach(h => {
      holidays.set(h.day, h.name);
    });
  }

  // ハッピーマンデー
  if (month === 1) {
    holidays.set(getNthMonday(year, 1, 2), '成人の日');
  }
  if (month === 7) {
    holidays.set(getNthMonday(year, 7, 3), '海の日');
  }
  if (month === 9) {
    holidays.set(getNthMonday(year, 9, 3), '敬老の日');
  }
  if (month === 10) {
    holidays.set(getNthMonday(year, 10, 2), 'スポーツの日');
  }

  // 春分の日（3月）
  if (month === 3) {
    holidays.set(getVernalEquinoxDay(year), '春分の日');
  }

  // 秋分の日（9月）
  if (month === 9) {
    holidays.set(getAutumnalEquinoxDay(year), '秋分の日');
  }

  // 振替休日の計算
  const substituteHolidays = new Map<number, string>();
  holidays.forEach((_, day) => {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) { // 日曜日の場合
      // 次の平日（祝日でない日）を振替休日とする
      let nextDay = day + 1;
      while (holidays.has(nextDay) || substituteHolidays.has(nextDay)) {
        nextDay++;
      }
      const daysInMonth = new Date(year, month, 0).getDate();
      if (nextDay <= daysInMonth) {
        substituteHolidays.set(nextDay, '振替休日');
      }
    }
  });

  // 振替休日を追加
  substituteHolidays.forEach((name, day) => {
    holidays.set(day, name);
  });

  // 国民の休日（祝日に挟まれた平日）
  // 9月の敬老の日と秋分の日の間をチェック
  if (month === 9) {
    const keirouDay = getNthMonday(year, 9, 3);
    const shubunDay = getAutumnalEquinoxDay(year);
    if (shubunDay - keirouDay === 2) {
      const middleDay = keirouDay + 1;
      if (!holidays.has(middleDay)) {
        holidays.set(middleDay, '国民の休日');
      }
    }
  }

  return holidays;
};

// 特定の日が祝日かどうかをチェック
export const isHoliday = (year: number, month: number, day: number): string | null => {
  const holidays = getHolidaysForMonth(year, month);
  return holidays.get(day) || null;
};
