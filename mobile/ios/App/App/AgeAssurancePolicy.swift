enum AgeAssuranceDecision: Equatable {
    case allowed
    case blocked(AgeAssuranceBlock)
}

enum AgeAssuranceBlock: Equatable {
    case notAdult
    case sharingDeclined
    case unsupportedResponse
}

enum AgeAssurancePolicy {
    static let minimumAge = 18

    static func decision(lowerBound: Int?) -> AgeAssuranceDecision {
        guard let lowerBound, lowerBound >= minimumAge else {
            return .blocked(.notAdult)
        }
        return .allowed
    }
}
