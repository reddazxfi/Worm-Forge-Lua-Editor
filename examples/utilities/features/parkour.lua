-- The global option reuses the same movement controller as the PX utility.

wa.on.worm_message(require("wf-lib/parkour").new(), {
  msgs = {wa.msg.FRAME_FINISH,wa.msg.JUMP,wa.msg.JUMP_UP},
})
