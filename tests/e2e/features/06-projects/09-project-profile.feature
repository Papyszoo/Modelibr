@projects @project-profile @batch1
Feature: Project profile and shell
    What a project says about itself and the surfaces it offers: the profile
    ("what is being made" - engines, platforms, genre, style, camera and the
    budgets that follow), the vocabulary the profile picks from, the four views
    of the workspace shell, and linking one of the project's models to a
    character in the cast.

    Background:
        Given a profile project exists

    Scenario: Setting the profile records what is being made
        When I open the details of the profile project
        And I expand the project profile section
        And I add the profile style "Low Poly"
        And I add the profile platform "Meta Quest"
        And I save the project profile
        Then the project profile should suggest the "Meta Quest" budget
        And the project brief should state the style "Low Poly"
        And the stored project profile should include the style "Low Poly" and the platform "Meta Quest"

    Scenario: The profile offers the vocabulary it can be set from
        When I open the details of the profile project
        And I expand the project profile section
        Then the profile style options should include "Low Poly"

    Scenario: The project workspace offers its four views
        When I open the details of the profile project
        Then the project workspace should offer its four views
        When I switch the project workspace to the "cast" view
        Then the project workspace should show the cast surface
        When I switch the project workspace to the "references" view
        Then the project workspace should show the references surface
        When I switch the project workspace to the "levels" view
        Then the project workspace should show the levels surface

    Scenario: Linking a project model to a character from the cast
        Given the profile project has a member model "Cast Body"
        And the profile project has a character "Cast Hero"
        When I open the details of the profile project
        And I switch the project workspace to the "cast" view
        And I link the model "Cast Body" to the character "Cast Hero" in the cast
        Then the character "Cast Hero" should list the linked model "Cast Body"
        And the API should link model "Cast Body" to character "Cast Hero"
