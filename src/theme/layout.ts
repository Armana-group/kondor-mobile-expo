import { borderRadius, spacing } from './colors';

export const layout = {
  screen: {
    gutter: spacing.xl,
    bottomPadding: 40,
  },
  header: {
    horizontalPadding: spacing.xl,
    topPadding: spacing.md,
    bottomPadding: spacing.lg,
    sideButtonWidth: 40,
    iconSize: 28,
  },
  card: {
    padding: spacing.lg,
    radius: borderRadius.xl,
  },
  section: {
    gap: spacing.lg,
    titleTopPadding: spacing.lg,
    titleBottomPadding: spacing.sm,
  },
  row: {
    minHeight: 58,
    tallMinHeight: 72,
    horizontalPadding: spacing.lg,
    verticalPadding: spacing.md,
    iconSize: 22,
    iconColumnWidth: 34,
    accessoryGap: spacing.sm,
    controlColumnWidth: 66,
    labelHelperGap: 2,
  },
  separator: {
    insetWithIcon: 50,
  },
  text: {
    helperTopMargin: 2,
  },
  warning: {
    gap: spacing.sm,
    topPadding: spacing.md,
    horizontalPadding: spacing.md,
    verticalPadding: 9,
    radius: borderRadius.md,
  },
};

export default layout;
