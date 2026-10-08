@history @history-fresh-upload @batch1
Feature: Upload History freshness
  The existing Upload History scenarios read history the setup phase already
  produced. This one uploads now and asks the page to show THAT upload, which
  is the direction the feature is actually used in.

  @history-fresh-upload
  Scenario: A freshly uploaded model appears in the history
    Given I am on the model list page
    When I upload a model "test-cube.glb" and store it as "history-fresh-model"
    And I navigate to the Upload History page
    Then the history should list the freshly uploaded model "history-fresh-model"
