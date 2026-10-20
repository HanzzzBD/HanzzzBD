/**
 * GraphQL documents. Each has an operation name so logs and fixtures can refer to it
 * without including variables. Page sizes are fixed here; page COUNTS are capped by callers.
 */
const ACTOR = `fragment LegendsActor on Actor { __typename login ... on User { databaseId createdAt } ... on Bot { databaseId } }`;
const REPO = `fragment LegendsRepo on Repository { databaseId name owner { login } isPrivate isFork isArchived }`;

export const CONTRIBUTED_REPOS = `query LegendsContributedRepos($login: String!, $after: String) {
  user(login: $login) {
    repositoriesContributedTo(first: 100, after: $after, includeUserRepositories: false,
      contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW, ISSUE]) {
      pageInfo { hasNextPage endCursor }
      nodes { ...LegendsRepo pushedAt defaultBranchRef { name } }
    }
  }
}
${REPO}`;

export const COMMIT_HISTORY = `query LegendsCommitHistory($owner: String!, $name: String!, $authorId: ID!, $since: GitTimestamp, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      name
      target {
        ... on Commit {
          history(first: 100, after: $after, since: $since, author: { id: $authorId }) {
            pageInfo { hasNextPage endCursor }
            nodes {
              oid authoredDate committedDate additions deletions changedFilesIfAvailable
              parents { totalCount }
              message
              authors(first: 10) { totalCount nodes { user { ...LegendsActor } } }
            }
          }
        }
      }
    }
  }
}
${ACTOR}`;

export const CALENDAR = `query LegendsCalendar($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      hasAnyRestrictedContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

export const PULL_REQUEST_CONTRIBUTIONS = `query LegendsPullRequests($login: String!, $from: DateTime!, $to: DateTime!, $after: String) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      pullRequestContributions(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          occurredAt
          pullRequest {
            id number state merged mergedAt createdAt
            author { ...LegendsActor } mergedBy { ...LegendsActor }
            repository { ...LegendsRepo }
            commits { totalCount }
            reviews(first: 20, states: [APPROVED]) { totalCount nodes { author { ...LegendsActor } } }
          }
        }
      }
    }
  }
}
${ACTOR}
${REPO}`;

export const REVIEW_CONTRIBUTIONS = `query LegendsReviews($login: String!, $from: DateTime!, $to: DateTime!, $after: String) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      pullRequestReviewContributions(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          occurredAt
          pullRequestReview { databaseId state submittedAt body }
          pullRequest { id author { ...LegendsActor } repository { ...LegendsRepo } }
        }
      }
    }
  }
}
${ACTOR}
${REPO}`;

export const ISSUE_CONTRIBUTIONS = `query LegendsIssues($login: String!, $from: DateTime!, $to: DateTime!, $after: String) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      issueContributions(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          occurredAt
          issue { id number state stateReason createdAt closedAt author { ...LegendsActor } repository { ...LegendsRepo } }
        }
      }
    }
  }
}
${ACTOR}
${REPO}`;

export const CLOSED_ISSUES = `query LegendsClosedIssues($owner: String!, $name: String!, $since: DateTime!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 50, after: $after, states: [CLOSED], filterBy: { since: $since },
      orderBy: { field: UPDATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number state stateReason createdAt closedAt
        author { ...LegendsActor }
        timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) { nodes { ... on ClosedEvent { actor { ...LegendsActor } } } }
      }
    }
  }
}
${ACTOR}`;
