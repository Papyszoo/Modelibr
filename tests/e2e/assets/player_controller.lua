local PlayerController = {}

function PlayerController.new(speed)
  local self = { speed = speed or 5, x = 0, y = 0 }
  setmetatable(self, { __index = PlayerController })
  return self
end

function PlayerController:move(dx, dy)
  self.x = self.x + dx * self.speed
  self.y = self.y + dy * self.speed
end

return PlayerController
